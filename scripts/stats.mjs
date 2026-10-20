import { readFileSync, existsSync } from 'node:fs';
import { computeStats } from '../src/lib/stats.js';

const path = process.argv[2] || (existsSync('public/data/city.geojson') ? 'public/data/city.geojson' : 'public/data/city.demo.geojson');
const fc = JSON.parse(readFileSync(path, 'utf8'));
console.log('الملف:', path);
console.log('المصدر:', fc.metadata?.source, '| اصطناعي:', !!fc.metadata?.synthetic);
console.log(computeStats(fc));
