import { prisma } from '../index';
import { trigramSimilarity, levenshteinDistance, tokenizeQuery } from '../utils/fuzzy';

// ── Types ────────────────────────────────────────────────────────────

export interface SearchResult {
  productId: string;
  displayName: string;    // "Wedding Cake — 3.5g Flower" or "Blue Dream Pre-Roll"
  strainName: string;
  category: string;
  price: number;          // sell_price
  currentStock: number;   // quantity at this location
  unitType: string;
  score: number;          // 0–1 ranking score
  matchedOn: 'name' | 'strain' | 'alias';
}

interface ProductRow {
  id: string;
  name: string;
  category: string;
  sell_price: unknown;       // Prisma Decimal
  unit_type: string;
  strain_name: string | null;
  strain_aliases: string[] | null;
  inventory_quantity: unknown; // Prisma Decimal
}

interface SalesRow {
  product_id: string;
  sales_count: number;
  last_sold: Date;
}

// ── Config ───────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.15;  // ignore results below this
const DEFAULT_LIMIT = 8;
const SIM_WEIGHT = 0.6;             // weight for textual similarity
const FREQ_WEIGHT = 0.4;            // weight for sales frequency
const SALES_WINDOW_DAYS = 30;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Main search function — predictive autocomplete for the POS search bar.
 *
 * 1. Fetches all active products at the given location (with strain & inventory).
 * 2. Computes client-side trigram similarity against product name, strain name,
 *    and strain aliases.
 * 3. Loads location-specific sales frequency (last 30 days) with recency decay.
 * 4. Merges scores: `sim × 0.6 + freq × 0.4` and returns the top results.
 */
export async function searchProducts(
  query: string,
  locationId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SearchResult[]> {
  const normalized = query.toLowerCase().trim();
  if (normalized.length < 1) return [];

  const terms = tokenizeQuery(query);

  // ── Step 1: Fetch candidate products ──────────────────────────────
  // We load all active products at this location.  For a typical
  // dispensary (hundreds to low-thousands of SKUs) this is < 50 ms.
  const products = await prisma.$queryRaw<ProductRow[]>`
    SELECT
      p.id,
      p.name,
      p.category::text,
      p.sell_price,
      p.unit_type::text,
      s.name              AS strain_name,
      s.aliases           AS strain_aliases,
      COALESCE(i.quantity, 0) AS inventory_quantity
    FROM products p
    LEFT JOIN strains s     ON s.id = p.strain_id
    LEFT JOIN inventory i   ON i.product_id = p.id
                           AND i.location_id = ${locationId}::uuid
    WHERE p.is_active = true
  `;

  // ── Step 2: Compute similarity for every candidate ────────────────
  interface Candidate {
    row: ProductRow;
    similarity: number;
    matchedOn: SearchResult['matchedOn'];
  }

  const candidates: Candidate[] = [];

  for (const row of products) {
    const productName = row.name.toLowerCase();
    const strainName = (row.strain_name ?? '').toLowerCase();
    const aliases: string[] = row.strain_aliases ?? [];

    // Best similarity across product name, strain name, and each alias
    let bestSim = 0;
    let matchedOn: SearchResult['matchedOn'] = 'name';

    // 1) Product name
    const productSim = trigramSimilarity(normalized, productName);
    if (productSim > bestSim) {
      bestSim = productSim;
      matchedOn = 'name';
    }

    // 2) Strain name
    if (strainName) {
      const strainSim = trigramSimilarity(normalized, strainName);
      if (strainSim > bestSim) {
        bestSim = strainSim;
        matchedOn = 'strain';
      }
    }

    // 3) Strain aliases
    for (const alias of aliases) {
      const aliasSim = trigramSimilarity(normalized, alias.toLowerCase());
      if (aliasSim > bestSim) {
        bestSim = aliasSim;
        matchedOn = 'alias';
      }
    }

    // Also try partial matches: if query has multiple terms, score
    // term-by-term and take the average.  This catches queries like
    // "wed cake" when the product is just "Wedding Cake".
    if (terms.length > 1 && bestSim < SIMILARITY_THRESHOLD) {
      const multiTermSim = computeMultiTermSimilarity(terms, [
        productName,
        strainName,
        ...aliases.map((a) => a.toLowerCase()),
      ]);
      if (multiTermSim > bestSim) {
        bestSim = multiTermSim;
        matchedOn = 'name'; // conservative
      }
    }

    // Only keep if above threshold
    if (bestSim >= SIMILARITY_THRESHOLD) {
      candidates.push({ row, similarity: bestSim, matchedOn });
    }
  }

  // If nothing passes the threshold, loosen it with Levenshtein as a
  // last-resort fallback (for very short queries like "we").
  if (candidates.length === 0) {
    for (const row of products) {
      const productName = row.name.toLowerCase();
      const strainName = (row.strain_name ?? '').toLowerCase();
      const aliases: string[] = row.strain_aliases ?? [];

      let bestSim = 0;
      let matchedOn: SearchResult['matchedOn'] = 'name';

      for (const target of [productName, strainName, ...aliases.map((a) => a.toLowerCase())]) {
        if (!target) continue;
        // Normalise Levenshtein to [0, 1] range
        const lev = levenshteinDistance(normalized, target);
        const maxLen = Math.max(normalized.length, target.length);
        const sim = maxLen === 0 ? 1 : 1 - lev / maxLen;
        if (sim > bestSim) {
          bestSim = sim;
          matchedOn = target === productName ? 'name' : target === strainName ? 'strain' : 'alias';
        }
      }

      if (bestSim > 0.3) {
        candidates.push({ row, similarity: bestSim * 0.8, matchedOn }); // penalise
      }
    }
  }

  if (candidates.length === 0) return [];

  // ── Step 3: Get sales frequency ───────────────────────────────────
  const salesFrequency = await getSalesFrequency(locationId);
  const maxSales = Math.max(1, ...Object.values(salesFrequency));

  // ── Step 4: Merge scores and build results ────────────────────────
  const results: SearchResult[] = candidates.map((c) => {
    const freqScore =
      maxSales > 0 ? (salesFrequency[c.row.id] || 0) / maxSales : 0;

    return {
      productId: c.row.id,
      displayName: buildDisplayName(c.row.name, c.row.strain_name, c.row.unit_type),
      strainName: c.row.strain_name ?? '',
      category: c.row.category,
      price: Number(c.row.sell_price),
      currentStock: Number(c.row.inventory_quantity),
      unitType: c.row.unit_type,
      score: c.similarity * SIM_WEIGHT + freqScore * FREQ_WEIGHT,
      matchedOn: c.matchedOn,
    };
  });

  // Sort by score descending, take top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ── Sales frequency (with recency decay) ─────────────────────────────

/**
 * Fetch per-product sales count for the last 30 days at a location,
 * applying recency decay so recently-popular items rank higher.
 */
async function getSalesFrequency(
  locationId: string,
): Promise<Record<string, number>> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - SALES_WINDOW_DAYS);

  const rows = await prisma.$queryRaw<SalesRow[]>`
    SELECT
      ti.product_id,
      COUNT(*)::int          AS sales_count,
      MAX(t.created_at)      AS last_sold
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.location_id = ${locationId}::uuid
      AND t.created_at >= ${thirtyDaysAgo}
      AND t.status = 'completed'
    GROUP BY ti.product_id
  `;

  const now = new Date();
  const freq: Record<string, number> = {};

  for (const row of rows) {
    const daysSince =
      (now.getTime() - row.last_sold.getTime()) / (1000 * 60 * 60 * 24);

    // Recency multiplier: 1.0 if sold ≤ 7 days ago, 0.7 ≤ 14 days, 0.4 otherwise
    let recency = 0.4;
    if (daysSince <= 7) recency = 1.0;
    else if (daysSince <= 14) recency = 0.7;

    freq[row.product_id] = row.sales_count * recency;
  }

  return freq;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Build a human-readable display name for the autocomplete dropdown.
 *
 * Examples:
 *   "Wedding Cake — 3.5g Flower"
 *   "Blue Dream — Pre-Roll (1g)"
 */
function buildDisplayName(
  productName: string,
  strainName: string | null,
  unitType: string,
): string {
  const base = strainName && strainName !== productName
    ? `${strainName} — ${productName}`
    : productName;

  return base;
}

/**
 * For multi-term queries, compute the average trigram similarity of
 * each query term against the best-matching target string.  This helps
 * when a user types "wed cake" and the product is "Wedding Cake".
 */
function computeMultiTermSimilarity(
  terms: string[],
  targets: string[],
): number {
  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const target of targets) {
      if (!target) continue;
      const sim = trigramSimilarity(term, target);
      if (sim > best) best = sim;
    }
    total += best;
  }
  return total / terms.length;
}
