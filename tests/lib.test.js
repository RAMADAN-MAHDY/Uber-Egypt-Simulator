import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeProjector } from '../src/lib/geo.js';
import { resolveHeight } from '../src/lib/heights.js';
import { computeStats } from '../src/lib/stats.js';
import { closestRoadPoint, isDrivableRoad, ribbon, roadWidth } from '../src/lib/roads.js';
import { stepCar } from '../src/lib/car-physics.js';
import { buildCityGeometry } from '../src/lib/city-geometry.js';
import { collidesWithBuildings } from '../src/lib/car-collision.js';
import { ESTIMATED_LEVELS, LEVEL_HEIGHT_M } from '../src/lib/config.js';

const demo = JSON.parse(readFileSync(new URL('../public/data/city.demo.geojson', import.meta.url), 'utf8'));
const DEMO_BBOX = demo.metadata.bbox;

test('الإسقاط: المرجع عند الصفر والاتجاهات صحيحة', () => {
  const p = makeProjector(30.5877, 31.5021);
  const [x, z] = p.project(31.5021, 30.5877);
  assert.ok(Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6);
  const [, zn] = p.project(31.5021, 30.5877 + 0.001);
  assert.ok(zn < 0, 'الشمال باتجاه -z');
  assert.ok(Math.abs(zn + 110.574) < 0.01);
  const [xe] = p.project(31.5021 + 0.001, 30.5877);
  assert.ok(xe > 90 && xe < 100, 'الشرق +x بطول درجة مقيّس بجيب التمام');
  const [lon, lat] = p.unproject(...p.project(31.5, 30.59));
  assert.ok(Math.abs(lon - 31.5) < 1e-9 && Math.abs(lat - 30.59) < 1e-9);
});

test('اختيار أقرب طريق يستبعد مسارات المشاة', () => {
  const roads = [
    { type: 'footway', name: 'ممشى', points: [[0, 0], [1, 0]] },
    { type: 'residential', name: 'شارع', points: [[10, 0], [20, 0]] },
  ];
  assert.equal(isDrivableRoad('footway'), false);
  assert.equal(isDrivableRoad('track'), true);
  assert.deepEqual(closestRoadPoint({ x: 0, z: 0 }, roads), { x: 10, z: 0, distance: 10, h: 0, name: 'شارع' });
});

test('الارتفاعات: height ثم levels ثم تقدير', () => {
  assert.deepEqual(resolveHeight({ height: '25 m' }), { height: 25, source: 'height' });
  assert.equal(resolveHeight({ height: '40', 'building:levels': '3' }).source, 'height');
  assert.deepEqual(resolveHeight({ 'building:levels': '5' }), { height: 5 * LEVEL_HEIGHT_M, source: 'levels' });
  assert.deepEqual(resolveHeight({ building: 'yes' }), { height: ESTIMATED_LEVELS * LEVEL_HEIGHT_M, source: 'estimated' });
  assert.equal(resolveHeight({ height: 'abc' }).source, 'estimated');
  assert.equal(resolveHeight({ 'building:levels': '-2' }).source, 'estimated');
  assert.ok(Math.abs(resolveHeight({ height: "30'" }).height - 9.144) < 1e-6);
});

test('الإحصاءات تعدّ الفعلي والتقديري', () => {
  const fc = { features: [
    { geometry: { type: 'Polygon' }, properties: { building: 'yes', height: '10' } },
    { geometry: { type: 'Polygon' }, properties: { building: 'yes', 'building:levels': '2' } },
    { geometry: { type: 'Polygon' }, properties: { building: 'yes' } },
    { geometry: { type: 'LineString' }, properties: { highway: 'residential' } },
  ] };
  const s = computeStats(fc);
  assert.equal(s.buildings, 3); assert.equal(s.actual, 2); assert.equal(s.estimated, 1); assert.equal(s.roads, 1);
  assert.equal(s.actualPct, 66.7);
});

test('شريط الطريق: عدد الرؤوس والعرض', () => {
  const r = ribbon([[0, 0], [10, 0], [20, 0]], 8);
  assert.equal(r.positions.length / 3, 6);
  assert.equal(r.indices.length, 12);
  assert.equal(Math.abs(r.positions[2] - r.positions[5]), 8);
  assert.equal(roadWidth('primary_link'), roadWidth('primary'));
});

test('السيارة: تتحرك للأمام وتنعطف يمينًا وتحترم الحد الأقصى', () => {
  let s = { x: 0, z: 0, h: 0, v: 0 };
  for (let i = 0; i < 60; i++) s = stepCar(s, { accel: 1, steer: 0 }, 1 / 30);
  assert.ok(s.x > 5 && Math.abs(s.z) < 1e-9 && s.v > 0);
  const h0 = s.h;
  for (let i = 0; i < 30; i++) s = stepCar(s, { accel: 1, steer: 1 }, 1 / 30);
  assert.ok(s.h > h0, 'يمين = زيادة h');
  for (let i = 0; i < 2000; i++) s = stepCar(s, { accel: 1, steer: 0 }, 1 / 30);
  assert.ok(s.v <= 22 + 1e-9);
  for (let i = 0; i < 200; i++) s = stepCar(s, { accel: -1, steer: 0 }, 1 / 30);
  assert.ok(s.v <= 0 && s.v >= -6);
});

test('البيانات التجريبية: المخطط والحدود والتنوع', () => {
  assert.equal(demo.metadata.synthetic, true);
  const s = computeStats(demo);
  assert.ok(s.roads >= 5 && s.buildings >= 200);
  assert.ok(s.actual > 0 && s.estimated > 0);
  for (const f of demo.features) {
    const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates;
    for (const [lon, lat] of ring) {
      assert.ok(lon >= DEMO_BBOX.west && lon <= DEMO_BBOX.east && lat >= DEMO_BBOX.south && lat <= DEMO_BBOX.north, 'داخل الحدود');
    }
    if (f.geometry.type === 'Polygon') assert.deepEqual(ring[0], ring.at(-1), 'حلقة مغلقة');
  }
});

test('بناء الهندسة: ارتفاعات متباينة وموقع انطلاق على طريق', () => {
  const c = buildCityGeometry(demo, makeProjector());
  const pos = c.buildingsGeometry.attributes.position;
  let maxY = 0; const heights = new Set();
  for (let i = 0; i < pos.count; i++) { maxY = Math.max(maxY, pos.getY(i)); if (pos.getY(i) > 0.01) heights.add(Math.round(pos.getY(i))); }
  assert.ok(heights.size >= 5, 'تنوع واضح في الارتفاعات');
  assert.ok(maxY >= 20);
  assert.ok(c.roadsGeometry.index.count > 0);
  assert.ok(Number.isFinite(c.spawn.x) && Number.isFinite(c.spawn.h));
  assert.equal(c.build.skippedBuildings, 0);
});

test('نقطة الانطلاق: أقرب طريق للمركز حتى لو وُجد طريق أطول وبعيد', () => {
  const p = makeProjector();
  const ll = (x, z) => p.unproject(x, z);
  const fc = { features: [
    { geometry: { type: 'LineString', coordinates: [ll(5000, 5000), ll(9000, 5200), ll(14000, 5400)] }, properties: { highway: 'primary' } },
    { geometry: { type: 'LineString', coordinates: [ll(-30, 40), ll(30, 40)] }, properties: { highway: 'residential' } },
  ] };
  const c = buildCityGeometry(fc, p);
  assert.ok(Math.hypot(c.spawn.x, c.spawn.z) < 60, 'قريب من المركز');
  assert.ok(Math.abs(c.spawn.z - 40) < 1);
});

test('التصادم: يوقف السيارة عند المبنى ولا يصطدم بطريق بعيد', () => {
  const building = [[[8, -2], [12, -2], [12, 2], [8, 2]]];
  assert.equal(collidesWithBuildings({ x: 5, z: 0, h: 0 }, building), true);
  assert.equal(collidesWithBuildings({ x: -10, z: 0, h: 0 }, building), false);
  assert.equal(collidesWithBuildings({ x: 10, z: 0, h: Math.PI / 2 }, building), true);
});

test('هندسة المدينة تجهز خطوط الطرق وأساسيات تفاصيل واجهات المباني', () => {
  const c = buildCityGeometry(demo, makeProjector());
  assert.ok(c.roads.length > 0);
  assert.ok(c.buildings.length > 0);
  assert.ok(c.windows.length > 0);
  assert.ok(c.balconies.length > 0);
  assert.ok(c.roofEdges.length > 0);
  assert.ok(c.roofTanks.length > 0);
});
