import https from 'https';

const LEAFLY_API = 'consumer-api.leafly.com';

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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject).setTimeout(8000, () => reject(new Error('timeout')));
  });
}

export async function fetchLeaflyStrain(query: string): Promise<LeaflyStrain | null> {
  const slug = slugify(query);
  if (!slug) return null;

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

  try {
    const raw = await httpGet(`https://${LEAFLY_API}/api/strains/v1/${slug}`);
    const data = JSON.parse(raw);

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
  } catch (err) {
    console.error('[leafly] Error fetching strain:', err instanceof Error ? err.message : String(err));
    cache.set(slug, { data: null, ts: Date.now() });
    return null;
  }
}
