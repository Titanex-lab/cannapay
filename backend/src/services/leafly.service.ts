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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
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
  const slug = slugify(query);
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
      description: data.description ? stripHtml(data.description).slice(0, 300) : '',
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

export async function searchLeaflyStrains(query: string): Promise<{ name: string; slug: string; category: string }[]> {
  const slug = slugify(query);
  if (!slug) return [];
  try {
    const data = await httpGet(`/api/strains/v1/${slug}`);
    if (data?.name) {
      return [{ name: data.name, slug: data.slug, category: data.category || 'Hybrid' }];
    }
    return [];
  } catch {
    return [];
  }
}
