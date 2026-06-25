/**
 * Fuzzy matching utilities for product/strain search.
 *
 * Provides Levenshtein distance as a fallback, trigram-based similarity
 * (client-side Jaccard index over character trigrams), and query
 * normalisation / tokenisation helpers.
 */

// ── Levenshtein distance ──────────────────────────────────────────────

/**
 * Standard dynamic-programming Levenshtein distance between two strings.
 * Lower is better — 0 means identical.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  // Fast-paths
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  // Use single-row optimisation — only keep two rows in memory
  let prevRow = new Uint16Array(bLen + 1);
  let currRow = new Uint16Array(bLen + 1);

  for (let j = 0; j <= bLen; j++) prevRow[j] = j;

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    const aChar = a.charCodeAt(i - 1);

    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost, // substitution
      );
    }

    // Swap rows
    const tmp = prevRow;
    prevRow = currRow;
    currRow = tmp;
  }

  return prevRow[bLen];
}

// ── Trigram helpers ───────────────────────────────────────────────────

/**
 * Extract all character trigrams from a string (with padding).
 * "abc" → ["  a", " ab", "abc", "bc ", "c  "]
 */
function getTrigrams(s: string): string[] {
  const padded = `  ${s} `;
  const len = padded.length;
  const trigrams: string[] = [];
  for (let i = 0; i < len - 2; i++) {
    trigrams.push(padded.substring(i, i + 3));
  }
  return trigrams;
}

/**
 * Client-side trigram similarity (Jaccard index).
 * Returns a value in [0, 1] where 1 = identical trigram sets.
 *
 * This is a pure-JS fallback when pg_trgm is not available on the
 * PostgreSQL server.  It produces comparable (though not identical)
 * results to PostgreSQL's `similarity()` function.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);

  if (trigramsA.length === 0 || trigramsB.length === 0) return 0;

  // Count intersection efficiently using a Set for the smaller array
  const setB = new Set(trigramsB);
  let intersection = 0;
  for (const t of trigramsA) {
    if (setB.has(t)) intersection++;
  }

  // Use Jaccard: |A ∩ B| / |A ∪ B|
  const union = trigramsA.length + trigramsB.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Query normalisation ───────────────────────────────────────────────

/**
 * Normalize a search query: lowercase, trim, collapse whitespace.
 */
export function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Tokenize query into individual search terms.
 * "wed cake   blue" → ["wed", "cake", "blue"]
 */
export function tokenizeQuery(query: string): string[] {
  return normalizeQuery(query)
    .split(' ')
    .filter((t) => t.length > 0);
}

// ── tsquery builder (for PostgreSQL full-text search) ─────────────────

/**
 * Build a tsquery string for PostgreSQL full-text search with prefix
 * matching on every token.
 *
 * "wed cake" → "wed:* & cake:*"
 */
export function buildTsQuery(query: string): string {
  return tokenizeQuery(query)
    .map((t) => `${t}:*`)
    .join(' & ');
}
