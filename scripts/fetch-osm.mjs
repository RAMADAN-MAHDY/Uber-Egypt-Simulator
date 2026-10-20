// يجلب الطرق والمباني لمنطقة الزقازيق من OpenStreetMap عبر Overpass API ويحفظها كـ GeoJSON.
// الاستخدام: npm run data:fetch [-- --bbox=جنوب,غرب,شمال,شرق]
// البيانات © مساهمو OpenStreetMap، ترخيص ODbL — https://www.openstreetmap.org/copyright
import { writeFileSync, mkdirSync } from 'node:fs';
import { BBOX } from '../src/lib/config.js';
import { computeStats } from '../src/lib/stats.js';

const arg = process.argv.find((a) => a.startsWith('--bbox='));
let bbox = BBOX;
if (arg) {
  const [south, west, north, east] = arg.slice(7).split(',').map(Number);
  if ([south, west, north, east].some((n) => !Number.isFinite(n))) throw new Error('صيغة --bbox غير صحيحة');
  bbox = { south, west, north, east };
}
const bb = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
const HIGHWAYS =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const query = `[out:json][timeout:90];(way["highway"~"^(${HIGHWAYS})$"](${bb});way["building"](${bb}););out geom;`;

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function fetchOverpass() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      console.log('جلب من', url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'uber-egypt-simulator/0.1 (prototype)' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn('فشل:', e.message);
    }
  }
  throw lastErr;
}

const KEEP = ['highway', 'name', 'name:ar', 'oneway', 'lanes', 'building', 'building:levels', 'height', 'roof:levels'];
const data = await fetchOverpass();
const features = [];
for (const el of data.elements) {
  if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
  const coords = el.geometry.map((p) => [p.lon, p.lat]);
  const tags = el.tags || {};
  const properties = Object.fromEntries(KEEP.filter((k) => tags[k] !== undefined).map((k) => [k, tags[k]]));
  if (tags.building) {
    const closed = coords.length >= 4 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
    if (!closed) continue;
    features.push({ type: 'Feature', id: `way/${el.id}`, properties, geometry: { type: 'Polygon', coordinates: [coords] } });
  } else if (tags.highway) {
    features.push({ type: 'Feature', id: `way/${el.id}`, properties, geometry: { type: 'LineString', coordinates: coords } });
  }
}

const fc = {
  type: 'FeatureCollection',
  metadata: {
    source: 'OpenStreetMap عبر Overpass API',
    synthetic: false,
    license: 'ODbL 1.0',
    attribution: '© OpenStreetMap contributors',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    bbox,
    fetched: new Date().toISOString(),
    note: 'يشمل المسارات (ways) فقط؛ المباني المعرّفة كعلاقات multipolygon غير مشمولة.',
  },
  features,
};
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/city.geojson', JSON.stringify(fc));
console.log('تم الحفظ → public/data/city.geojson');
console.log(computeStats(fc));
