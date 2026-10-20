import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { resolveHeight, isActual } from './heights.js';
import { ribbon, roadWidth } from './roads.js';
import { computeStats } from './stats.js';

const LOW = new THREE.Color(0x9cc3e8);
const MID = new THREE.Color(0x2b5aa0);
const HIGH = new THREE.Color(0x1b2f63);
const SAND = new THREE.Color(0xdccaa0);

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** لون المبنى: تدرج أزرق حسب الارتفاع الفعلي، ورملي موحّد للتقديري. */
export function buildingColor(height, source, id) {
  const j = (hash01(String(id)) - 0.5) * 0.08;
  if (!isActual(source)) return SAND.clone().offsetHSL(0, 0, j);
  const t = Math.min(1, Math.max(0, (height - 6) / 54));
  const c = t < 0.5 ? LOW.clone().lerp(MID, t * 2) : MID.clone().lerp(HIGH, (t - 0.5) * 2);
  return c.offsetHSL(0, 0, j);
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/**
 * يبني هندسة المدينة (طرق + مبانٍ) من GeoJSON دون الحاجة إلى WebGL.
 * يعيد { roadsGeometry, buildingsGeometry, spawn, stats, build: {skipped, triangles} }.
 */
export function buildCityGeometry(fc, projector) {
  const roadPositions = [];
  const roadIndices = [];
  const buildingGeos = [];
  const buildings = [];
  const roads = [];
  const windows = [];
  const balconies = [];
  const roofEdges = [];
  const roofTanks = [];
  let skipped = 0;
  let nearest = null; // أقرب قطعة طريق لمركز المنطقة (موضع انطلاق السيارة)

  for (const f of fc.features || []) {
    const g = f.geometry;
    const p = f.properties || {};
    if (!g) continue;

    if (g.type === 'LineString' && p.highway) {
      const pts = g.coordinates.map(([lon, lat]) => projector.project(lon, lat));
      if (pts.length < 2) continue;
      const name = p['name:ar'] || p.name || p['name:en'] || '';
      roads.push({ points: pts, name, type: p.highway });
      const r = ribbon(pts, roadWidth(p.highway));
      const offset = roadPositions.length / 3;
      for (const v of r.positions) roadPositions.push(v);
      for (const i of r.indices) roadIndices.push(i + offset);

      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1) continue;
        const t = Math.max(0, Math.min(1, -(ax * dx + az * dz) / l2));
        const cx = ax + t * dx;
        const cz = az + t * dz;
        const d = Math.hypot(cx, cz);
        if (!nearest || d < nearest.d) nearest = { d, x: cx, z: cz, h: Math.atan2(dz, dx) };
      }
    } else if (g.type === 'Polygon' && p.building) {
      let ring = g.coordinates[0].map(([lon, lat]) => projector.project(lon, lat));
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) ring = ring.slice(0, -1);
      if (ring.length < 3 || polygonArea(ring) < 4) {
        skipped++;
        continue;
      }
      const { height, source } = resolveHeight(p);
      buildings.push(ring);
      const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); // الشكل (x, الشمال) → العالم (x, y لأعلى, z جنوبًا)
      geo.deleteAttribute('uv');
      const color = buildingColor(height, source, f.id ?? p.id ?? buildingGeos.length);
      const n = geo.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      buildingGeos.push(geo);

      let signedArea = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, z1] = ring[i];
        const [x2, z2] = ring[(i + 1) % ring.length];
        signedArea += x1 * z2 - x2 * z1;
      }
      const floorCount = Math.max(1, Math.ceil(height / 3));
      const center = ring.reduce((sum, [x, z]) => [sum[0] + x / ring.length, sum[1] + z / ring.length], [0, 0]);
      if (buildingGeos.length % 2 === 0) roofTanks.push({ x: center[0], y: height + 0.7, z: center[1] });
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[(i + 1) % ring.length];
        const dx = bx - ax;
        const dz = bz - az;
        const length = Math.hypot(dx, dz);
        if (length < 3) continue;
        const outward = signedArea > 0 ? [dz / length, -dx / length] : [-dz / length, dx / length];
        const angle = -Math.atan2(dz, dx) + (signedArea > 0 ? Math.PI : 0);
        const count = Math.floor(length / 3.8);
        for (let j = 0; j < count; j++) {
          const t = (j + 1) / (count + 1);
          const x = ax + dx * t + outward[0] * 0.12;
          const z = az + dz * t + outward[1] * 0.12;
          for (let floor = 0; floor < floorCount; floor++) {
            const y = floor * 3 + 1.7;
            if (y + 0.9 >= height) continue;
            windows.push({ x, y, z, angle });
            if ((j + floor) % 3 === 0) {
              balconies.push({
                x: x + outward[0] * 0.35,
                y: floor * 3 + 1.05,
                z: z + outward[1] * 0.35,
                angle,
              });
            }
          }
        }
        roofEdges.push({ x: (ax + bx) / 2, y: height + 0.35, z: (az + bz) / 2, angle, length });
      }
    }
  }

  const roadsGeometry = new THREE.BufferGeometry();
  roadsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
  roadsGeometry.setIndex(roadIndices);
  roadsGeometry.computeVertexNormals();

  const buildingsGeometry = buildingGeos.length ? mergeGeometries(buildingGeos, false) : new THREE.BufferGeometry();
  buildingGeos.forEach((g) => g.dispose());

  let spawn = { x: 0, z: 0, h: 0 };
  if (nearest) spawn = { x: nearest.x, z: nearest.z, h: nearest.h };

  const triangles =
    (roadIndices.length + (buildingsGeometry.attributes.position ? buildingsGeometry.attributes.position.count : 0)) / 3;

  return {
    roadsGeometry,
    buildingsGeometry,
    buildings,
    roads,
    windows,
    balconies,
    roofEdges,
    roofTanks,
    spawn,
    stats: computeStats(fc),
    build: { skippedBuildings: skipped, triangles: Math.round(triangles) },
  };
}
