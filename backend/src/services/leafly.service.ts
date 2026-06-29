import { config } from '../config';

const LEAFLY_API = 'https://consumer-api.leafly.com/api/strains/v1';

interface LeaflyStrain {
  name: string;
  slug: string;
  category: string;
  thcPercent: number | null;
  cbdPercent: number | null;
  description: string;
  topEffect: string | null;
}

const cache = new Map<string, { data: LeaflyStrain | null; ts: number }>();
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '').trim();
}

export async function fetchLeaflyStrain(query: string): Promise<LeaflyStrain | null> {
  return searchStrains(query);
}

async function searchStrains(query: string): Promise<LeaflyStrain | null> {
  const slug = slugify(query);
  if (!slug) return null;

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${LEAFLY_API}/${slug}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      cache.set(slug, { data: null, ts: Date.now() });
      return null;
    }

    const data = await res.json();
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
    console.error('[leafly] Error fetching strain:', err instanceof Error ? err.message : err);
    cache.set(slug, { data: null, ts: Date.now() });
    return null;
  }
}
