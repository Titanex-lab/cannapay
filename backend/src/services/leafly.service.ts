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
const SEARCH_CACHE = new Map<string, { data: { name: string; slug: string }[]; ts: number }>();
const SEARCH_CACHE_MS = 5 * 60 * 1000; // 5 minutes

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json',
};

// Comprehensive strain index — 100+ popular strains from Leafly
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
  { name: 'Afghan Kush', slug: 'afghan-kush' },
  { name: 'Alien OG', slug: 'alien-og' },
  { name: 'Apple Fritter', slug: 'apple-fritter' },
  { name: 'Banana Kush', slug: 'banana-kush' },
  { name: 'Biscotti', slug: 'biscotti' },
  { name: 'Blackberry Kush', slug: 'blackberry-kush' },
  { name: 'Blue Cheese', slug: 'blue-cheese' },
  { name: 'Bubble Gum', slug: 'bubble-gum' },
  { name: 'Candyland', slug: 'candyland' },
  { name: 'Chemdawg', slug: 'chemdawg' },
  { name: 'Cherry AK-47', slug: 'cherry-ak-47' },
  { name: 'Chocolate Thai', slug: 'chocolate-thai' },
  { name: 'Cookies and Cream', slug: 'cookies-and-cream' },
  { name: 'Critical Mass', slug: 'critical-mass' },
  { name: 'Death Star', slug: 'death-star' },
  { name: 'Dutch Treat', slug: 'dutch-treat' },
  { name: 'Fire OG', slug: 'fire-og' },
  { name: 'Forbidden Fruit', slug: 'forbidden-fruit' },
  { name: 'Fruity Pebbles', slug: 'fruity-pebbles' },
  { name: 'Ghost Train Haze', slug: 'ghost-train-haze' },
  { name: 'Godfather OG', slug: 'godfather-og' },
  { name: 'Golden Goat', slug: 'golden-goat' },
  { name: 'Grape Ape', slug: 'grape-ape' },
  { name: 'Harlequin', slug: 'harlequin' },
  { name: 'Headband', slug: 'headband' },
  { name: 'Hindu Kush', slug: 'hindu-kush' },
  { name: 'Ice Cream Cake', slug: 'ice-cream-cake' },
  { name: 'Jillybean', slug: 'jillybean' },
  { name: 'King Louis XIII', slug: 'king-louis-xiii' },
  { name: 'LA Confidential', slug: 'la-confidential' },
  { name: 'Laughing Buddha', slug: 'laughing-buddha' },
  { name: 'Lemon Skunk', slug: 'lemon-skunk' },
  { name: 'MAC', slug: 'mac' },
  { name: 'Mango Kush', slug: 'mango-kush' },
  { name: 'Master Kush', slug: 'master-kush' },
  { name: 'Maui Wowie', slug: 'maui-wowie' },
  { name: 'NYC Diesel', slug: 'nyc-diesel' },
  { name: 'Obama Kush', slug: 'obama-kush' },
  { name: 'Orange Crush', slug: 'orange-crush' },
  { name: 'Pink Kush', slug: 'pink-kush' },
  { name: 'Platinum OG', slug: 'platinum-og' },
  { name: 'Purple Haze', slug: 'purple-haze' },
  { name: 'Purple Urkle', slug: 'purple-urkle' },
  { name: 'SFV OG', slug: 'sfv-og' },
  { name: 'Sherbet', slug: 'sherbet' },
  { name: 'Skywalker OG', slug: 'skywalker-og' },
  { name: 'Strawberry Banana', slug: 'strawberry-banana' },
  { name: 'Sunset Sherbet', slug: 'sunset-sherbet' },
  { name: 'Super Lemon Haze', slug: 'super-lemon-haze' },
  { name: 'Tahoe OG', slug: 'tahoe-og' },
  { name: 'Tangie', slug: 'tangie' },
  { name: 'Tangerine Dream', slug: 'tangerine-dream' },
  { name: 'White Rhino', slug: 'white-rhino' },
  { name: 'White Buffalo', slug: 'white-buffalo' },
  { name: 'White Fire OG', slug: 'white-fire-og' },
  { name: 'White Runtz', slug: 'white-runtz' },
  { name: 'Yoda OG', slug: 'yoda-og' },
  { name: 'Acapulco Gold', slug: 'acapulco-gold' },
  { name: 'Agent Orange', slug: 'agent-orange' },
  { name: 'Alaskan Thunder Fuck', slug: 'alaskan-thunder-fuck' },
  { name: 'Animal Cookies', slug: 'animal-cookies' },
  { name: 'Apple Jack', slug: 'apple-jack' },
  { name: 'Berry White', slug: 'berry-white' },
  { name: 'Black Widow', slug: 'black-widow' },
  { name: 'Blue Cookies', slug: 'blue-cookies' },
  { name: 'Blue Gelato', slug: 'blue-gelato' },
  { name: 'Candy Jack', slug: 'candy-jack' },
  { name: 'Cinex', slug: 'cinex' },
  { name: 'Cookie Dough', slug: 'cookie-dough' },
  { name: 'Cotton Candy Kush', slug: 'cotton-candy-kush' },
  { name: 'Double Dream', slug: 'double-dream' },
  { name: 'Dragon OG', slug: 'dragon-og' },
  { name: 'G13', slug: 'g13' },
  { name: 'Gelato 33', slug: 'gelato-33' },
  { name: 'Ghost OG', slug: 'ghost-og' },
  { name: 'Girl Scout Glue', slug: 'girl-scout-glue' },
  { name: 'GMO Cookies', slug: 'gmo-cookies' },
  { name: 'Grape Stomper', slug: 'grape-stomper' },
  { name: 'Green Goblin', slug: 'green-goblin' },
  { name: 'Guava Kush', slug: 'guava-kush' },
  { name: 'Hell Fire OG', slug: 'hell-fire-og' },
  { name: 'Holy Grail Kush', slug: 'holy-grail-kush' },
  { name: 'Incredible Hulk', slug: 'incredible-hulk' },
  { name: 'Key Lime Pie', slug: 'key-lime-pie' },
  { name: 'King Kong', slug: 'king-kong' },
  { name: 'Lemon OG', slug: 'lemon-og' },
  { name: 'LSD', slug: 'lsd' },
  { name: 'Mazar', slug: 'mazar' },
  { name: 'Moonshine Haze', slug: 'moonshine-haze' },
  { name: 'Ninja Fruit', slug: 'ninja-fruit' },
  { name: 'Panama Red', slug: 'panama-red' },
  { name: 'Pineapple Kush', slug: 'pineapple-kush' },
  { name: 'Pre-98 Bubba Kush', slug: 'pre-98-bubba-kush' },
  { name: 'Purple Diesel', slug: 'purple-diesel' },
  { name: 'Purple Kush', slug: 'purple-kush' },
  { name: 'Recon', slug: 'recon' },
  { name: 'Red Dragon', slug: 'red-dragon' },
  { name: 'Skunk #1', slug: 'skunk-1' },
  { name: 'Sour Tangie', slug: 'sour-tangie' },
  { name: 'Space Queen', slug: 'space-queen' },
  { name: 'Strawberry Diesel', slug: 'strawberry-diesel' },
  { name: 'Sunset OG', slug: 'sunset-og' },
  { name: 'Sweet Tooth', slug: 'sweet-tooth' },
  { name: 'Thin Mint GSC', slug: 'thin-mint-gsc' },
  { name: 'Triple OG', slug: 'triple-og' },
  { name: 'True OG', slug: 'true-og' },
  { name: 'Vanilla Kush', slug: 'vanilla-kush' },
  { name: 'Venom OG', slug: 'venom-og' },
  { name: 'White Cookies', slug: 'white-cookies' },
  { name: 'White Diesel', slug: 'white-diesel' },
  { name: 'White Lavender', slug: 'white-lavender' },
  { name: 'White Nightmare', slug: 'white-nightmare' },
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

    // Also add to the search index if not already there
    if (!STRAIN_INDEX.some(s => s.slug === data.slug)) {
      STRAIN_INDEX.push({ name: data.name, slug: data.slug });
    }

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

  // Check search cache first
  const cached = SEARCH_CACHE.get(q);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_MS) return cached.data;

  // Match against the index — starts-with or contains
  const matches = STRAIN_INDEX
    .filter(s => s.name.toLowerCase().includes(q) || s.slug.includes(q))
    .slice(0, 8);

  // Also try the query as a direct slug
  const sl = slugify(query);
  if (!matches.some(m => m.slug === sl) && q.length >= 2) {
    matches.unshift({ name: query, slug: sl });
  }

  // Trim to 8 max
  const results = matches.slice(0, 8);
  SEARCH_CACHE.set(q, { data: results, ts: Date.now() });
  return results;
}
