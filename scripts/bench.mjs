// قياس زمن بناء الهندسة (بدون WebGL) وعدد المثلثات. لا يقيس FPS.
import { readFileSync, existsSync } from 'node:fs';
import { makeProjector } from '../src/lib/geo.js';
import { buildCityGeometry } from '../src/lib/city-geometry.js';

const path = process.argv[2] || (existsSync('public/data/city.geojson') ? 'public/data/city.geojson' : 'public/data/city.demo.geojson');
const fc = JSON.parse(readFileSync(path, 'utf8'));
const proj = makeProjector();
const runs = [];
let last;
for (let i = 0; i < 5; i++) {
  const t = performance.now();
  last = buildCityGeometry(fc, proj);
  runs.push(performance.now() - t);
}
runs.sort((a, b) => a - b);
console.log('الملف:', path);
console.log('زمن بناء الهندسة (ms) — الوسيط من 5 تشغيلات:', runs[2].toFixed(1), '| الأدنى:', runs[0].toFixed(1), '| الأعلى:', runs[4].toFixed(1));
console.log('المثلثات التقريبية:', last.build.triangles, '| مبانٍ مُتخطاة:', last.build.skippedBuildings);
console.log('إحصاءات:', last.stats);
