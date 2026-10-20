// يولّد بيانات تجريبية (اصطناعية) بنفس مخطط بيانات OSM لاختبار النموذج دون إنترنت.
// تحذير: هذه ليست خريطة الزقازيق الحقيقية. لجلب البيانات الحقيقية: npm run data:fetch
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeProjector } from '../src/lib/geo.js';
import { BBOX } from '../src/lib/config.js';
import { roadWidth } from '../src/lib/roads.js';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261019);
const range = (a, b) => a + rnd() * (b - a);

const proj = makeProjector();
const [x0, z1] = proj.project(BBOX.west, BBOX.south);
const [x1, z0] = proj.project(BBOX.east, BBOX.north);
const margin = 25;
const minX = x0 + margin, maxX = x1 - margin, minZ = z0 + margin, maxZ = z1 - margin;

// الطرق: شبكة شبه منتظمة + طريق قطري + شارع رئيسي منحنٍ
const roads = [];
const classes = ['residential', 'residential', 'tertiary', 'secondary'];
let rid = 1;
for (let z = minZ + 40, i = 0; z < maxZ - 20; z += range(120, 170), i++) {
  const pts = [];
  for (let x = minX; x <= maxX; x += 60) pts.push([x, z + Math.sin(x / 120 + i) * 6]);
  roads.push({ highway: classes[i % classes.length], name: `شارع تجريبي أفقي ${i + 1}`, pts });
}
for (let x = minX + 50, i = 0; x < maxX - 30; x += range(110, 160), i++) {
  const pts = [];
  for (let z = minZ; z <= maxZ; z += 60) pts.push([x + Math.cos(z / 140 + i) * 5, z]);
  roads.push({ highway: classes[(i + 1) % classes.length], name: `شارع تجريبي رأسي ${i + 1}`, pts });
}
roads.push({ highway: 'primary', name: 'الشارع الرئيسي التجريبي', pts: Array.from({ length: 14 }, (_, i) => {
  const t = i / 13;
  return [minX + t * (maxX - minX), minZ + 30 + t * (maxZ - minZ - 60) + Math.sin(t * 6) * 25];
}) });

function distPointSeg(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}
const clearOfRoads = (px, pz) =>
  roads.every((r) => {
    const lim = roadWidth(r.highway) / 2 + 2;
    for (let i = 0; i < r.pts.length - 1; i++) if (distPointSeg(px, pz, r.pts[i], r.pts[i + 1]) < lim) return false;
    return true;
  });

// المباني على جانبي كل طريق
const buildings = [];
const centers = [];
for (const r of roads) {
  const setback = roadWidth(r.highway) / 2 + 3;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
    const nx = -tz, nz = tx;
    for (const side of [-1, 1]) {
      let s = range(0, 8);
      while (s < len - 10) {
        const w = range(11, 26), d = range(10, 22);
        const px = a[0] + tx * (s + w / 2), pz = a[1] + tz * (s + w / 2);
        const cx = px + nx * side * (setback + d / 2), cz = pz + nz * side * (setback + d / 2);
        s += w + range(1.5, 7);
        if (cx < minX || cx > maxX || cz < minZ || cz > maxZ) continue;
        if (!clearOfRoads(cx, cz)) continue;
        if (centers.some(([ox, oz]) => Math.hypot(ox - cx, oz - cz) < 15)) continue;
        const corner = (u, v) => [px + tx * u + nx * side * v, pz + tz * u + nz * side * v];
        const ring = [corner(-w / 2, setback), corner(w / 2, setback), corner(w / 2, setback + d), corner(-w / 2, setback + d)];
        if (!ring.every(([qx, qz]) => clearOfRoads(qx, qz))) continue;
        centers.push([cx, cz]);
        buildings.push(ring);
      }
    }
  }
}

const toLL = ([x, z]) => proj.unproject(x, z).map((v) => Math.round(v * 1e7) / 1e7);
const features = [];
roads.forEach((r, i) =>
  features.push({ type: 'Feature', id: `demo/road/${i + 1}`, properties: { highway: r.highway, name: r.name }, geometry: { type: 'LineString', coordinates: r.pts.map(toLL) } })
);
buildings.forEach((ring, i) => {
  const props = { building: 'yes' };
  const r = rnd();
  if (r < 0.06) props.height = String(Math.round(range(14, 48)));
  else if (r < 0.34) props['building:levels'] = String(Math.round(rnd() < 0.15 ? range(9, 16) : range(2, 8)));
  const ll = ring.map(toLL);
  ll.push(ll[0]);
  features.push({ type: 'Feature', id: `demo/building/${i + 1}`, properties: props, geometry: { type: 'Polygon', coordinates: [ll] } });
});

const fc = {
  type: 'FeatureCollection',
  metadata: {
    source: 'بيانات تجريبية مولّدة اصطناعيًا (ليست من OpenStreetMap وليست خريطة الزقازيق الفعلية)',
    synthetic: true,
    license: 'لا ينطبق (بيانات اصطناعية)',
    attribution: '',
    bbox: BBOX,
    generated: new Date().toISOString().slice(0, 10),
  },
  features,
};
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/city.demo.geojson', JSON.stringify(fc));
console.log(`تم توليد ${roads.length} طريقًا و${buildings.length} مبنى → public/data/city.demo.geojson`);
