import https from 'https';

const LEAFLY_HOST = 'consumer-api.leafly.com';

export interface LeaflyStrain {
  name: string;
  slug: string;
  category: string;
  thcPercent: number | null;
  cbdPercent: number | null;
  description: string;
  topEffect: string | null;
}

const cache = new Map<string, { data: LeaflyStrain | null; ts: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json',
};

// Popular strain index for autocomplete — built from known Leafly slugs
const STRAIN_INDEX: { name: string; slug: string }[] = [
  { name: 'Blue Dream', slug: 'blue-dream' },
  { name: 'Wedding Cake', slug: 'wedding-cake' },
  { name: 'OG Kush', slug: 'og-kush' },
  { name: 'Girl Scout Cookies', slug: 'girl-scout-cookies' },
  { name: 'Granddaddy Purple', slug: 'granddaddy-purple' },
  { name: 'Durban Poison', slug: 'durban-poison' },
  { name: 'Gelato', slug: 'gelato' },
  { name: 'White Widow', slug: 'white-widow' },
  { name: 'Sour Diesel', slug: 'sour-diesel' },
  { name: 'Northern Lights', slug: 'northern-lights' },
  { name: 'Runtz', slug: 'runtz' },
  { name: 'Do-Si-Dos', slug: 'do-si-dos' },
  { name: 'Jack Herer', slug: 'jack-herer' },
  { name: 'Bubba Kush', slug: 'bubba-kush' },
  { name: 'Pineapple Express', slug: 'pineapple-express' },
  { name: 'Green Crack', slug: 'green-crack' },
  { name: 'Mimosa', slug: 'mimosa' },
  { name: 'Zkittlez', slug: 'zkittlez' },
  { name: 'AK-47', slug: 'ak-47' },
  { name: 'Cheese', slug: 'cheese' },
  { name: 'Blueberry', slug: 'blueberry' },
  { name: 'Super Silver Haze', slug: 'super-silver-haze' },
  { name: 'Amnesia Haze', slug: 'amnesia-haze' },
  { name: 'Bruce Banner', slug: 'bruce-banner' },
  { name: 'Gorilla Glue', slug: 'gorilla-glue-4' },
  { name: 'Trainwreck', slug: 'trainwreck' },
  { name: 'Lemon Haze', slug: 'lemon-haze' },
  { name: 'Purple Punch', slug: 'purple-punch' },
  { name: 'Strawberry Cough', slug: 'strawberry-cough' },
  { name: 'Cherry Pie', slug: 'cherry-pie' },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
}

function extractDescription(data: any): string {
  const parts: string[] = [];
  const desc = data.description ? stripHtml(data.description).slice(0, 200) : '';
  if (desc) parts.push(desc);
  if (data.topEffect) parts.push(`Top effect: ${data.topEffect}`);
  const terps = data.topTerps || data.terps;
  if (terps && typeof terps === 'object') {
    const names = Object.values(terps).map((t: any) => t.name).join(', ');
    if (names) parts.push(`Terpenes: ${names}`);
  }
  const flavors = data.flavors;
  if (flavors && typeof flavors === 'object') {
    const top = Object.values(flavors)
      .sort((a: any, b: any) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 5)
      .map((f: any) => f.name)
      .join(', ');
    if (top) parts.push(`Flavors: ${top}`);
  }
  return parts.join(' · ');
}

function httpGet(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: LEAFLY_HOST, path, headers: HEADERS, timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

export async function fetchLeaflyStrain(query: string): Promise<LeaflyStrain | null> {
  const slug = query.includes('-') ? query : slugify(query);
  if (!slug) return null;

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

  try {
    const data = await httpGet(`/api/strains/v1/${slug}`);
    if (!data?.name) {
      cache.set(slug, { data: null, ts: Date.now() });
      return null;
    }
    const strain: LeaflyStrain = {
      name: data.name,
      slug: data.slug,
      category: data.category || 'Hybrid',
      thcPercent: data.cannabinoids?.thc?.percentile50 ?? null,
      cbdPercent: data.cannabinoids?.cbd?.percentile50 ?? null,
      description: extractDescription(data),
      topEffect: data.topEffect || null,
    };
    cache.set(slug, { data: strain, ts: Date.now() });
    return strain;
  } catch (err: any) {
    console.error('[leafly] Error:', err?.message || String(err));
    cache.set(slug, { data: null, ts: Date.now() });
    return null;
  }
}

export function searchLeaflyStrains(query: string): { name: string; slug: string }[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  // Match against the index — starts-with or contains
  const matches = STRAIN_INDEX
    .filter(s => s.name.toLowerCase().includes(q) || s.slug.includes(q))
    .slice(0, 6);
  // Also try the query as a direct slug (so custom strains work too)
  const sl = slugify(query);
  if (!matches.some(m => m.slug === sl)) {
    matches.unshift({ name: query, slug: sl });
  }
  return matches;
}
