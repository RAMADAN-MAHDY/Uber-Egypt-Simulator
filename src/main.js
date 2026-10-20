import * as THREE from 'three';
import { makeProjector } from './lib/geo.js';
import { buildCityGeometry } from './lib/city-geometry.js';
import { collidesWithBuildings } from './lib/car-collision.js';
import { stepCar } from './lib/car-physics.js';
import { BBOX, OSM_ATTRIBUTION } from './lib/config.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');

// ---------- المشهد ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe3f2);
scene.fog = new THREE.Fog(0xcfe3f2, 220, 650);
const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 1500);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8a7a, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-80, 140, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -700;
sun.shadow.camera.right = 700;
sun.shadow.camera.top = 700;
sun.shadow.camera.bottom = -700;
scene.add(sun);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- تحميل البيانات ----------
async function loadJson(name) {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(await res.text()); // يفشل إن أُعيدت صفحة HTML بدل JSON
}
async function loadCity() {
  try {
    return await loadJson('city.geojson');
  } catch {
    return await loadJson('city.demo.geojson');
  }
}

// ---------- السيارة ----------
function makeCar() {
  const car = new THREE.Group(); // الأمام = +X
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 1.9), mat(0xf4c20d));
  body.position.y = 0.75;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.7), mat(0x24323f));
  cabin.position.set(-0.3, 1.5, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 14);
  wheelGeo.rotateX(Math.PI / 2);
  for (const [x, z] of [[1.4, 1], [1.4, -1], [-1.4, 1], [-1.4, -1]]) {
    const w = new THREE.Mesh(wheelGeo, mat(0x111111));
    w.position.set(x, 0.42, z * 0.95);
    car.add(w);
  }
  const lamp = (x, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.4), mat(c));
    m.position.set(x, 0.85, z);
    return m;
  };
  car.add(body, cabin, lamp(2.22, 0.6, 0xffffff), lamp(2.22, -0.6, 0xffffff), lamp(-2.22, 0.6, 0xe03131), lamp(-2.22, -0.6, 0xe03131));
  // سهم أصفر على السقف يوضح اتجاه الحركة
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 3), mat(0xff3b30));
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(0.6, 2.1, 0);
  car.add(arrow);
  car.scale.setScalar(1.6);
  return car;
}

// ---------- الإدخال ----------
const keys = { up: false, down: false, left: false, right: false, brake: false };
const keyMap = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'brake' };
let followHeading = true;
let resetRequested = false;
window.addEventListener('keydown', (e) => {
  if (keyMap[e.key]) { keys[keyMap[e.key]] = true; e.preventDefault(); }
  if (e.key === 'c' || e.key === 'C') followHeading = !followHeading;
  if (e.key === 'r' || e.key === 'R') resetRequested = true;
});
window.addEventListener('keyup', (e) => { if (keyMap[e.key]) keys[keyMap[e.key]] = false; });
window.addEventListener('blur', () => Object.keys(keys).forEach((k) => (keys[k] = false)));
document.querySelectorAll('#controls button').forEach((btn) => {
  const k = btn.dataset.key;
  const on = (e) => { e.preventDefault(); keys[k] = true; btn.classList.add('on'); btn.setPointerCapture?.(e.pointerId); };
  const off = (e) => { e.preventDefault(); keys[k] = false; btn.classList.remove('on'); };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// ---------- التشغيل ----------
const fmt = (n) => n.toLocaleString('ar-EG');
async function init() {
  const fc = await loadCity();
  const proj = makeProjector();
  const city = buildCityGeometry(fc, proj);

  // الأرضية
  const [x0, z1] = proj.project(BBOX.west, BBOX.south);
  const [x1, z0] = proj.project(BBOX.east, BBOX.north);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(4000, x1 - x0 + 3000), Math.max(4000, z1 - z0 + 3000)),
    new THREE.MeshLambertMaterial({ color: 0xe9e5d6 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((x0 + x1) / 2, -0.02, (z0 + z1) / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(new THREE.Mesh(
    city.roadsGeometry,
    new THREE.MeshLambertMaterial({ color: 0x3a3f47, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide })
  ));
  const buildingsMesh = new THREE.Mesh(city.buildingsGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  buildingsMesh.castShadow = true;
  buildingsMesh.receiveShadow = true;
  scene.add(buildingsMesh);

  const addInstances = (geometry, material, items, dimensions, depthOffset = 0) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    const transform = new THREE.Object3D();
    items.forEach((item, index) => {
      transform.position.set(
        item.x + Math.sin(item.angle) * depthOffset,
        item.y,
        item.z + Math.cos(item.angle) * depthOffset
      );
      transform.rotation.set(0, item.angle, 0);
      transform.scale.set(dimensions[0], dimensions[1], dimensions[2]);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  addInstances(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xd9d0bc }),
    city.roofEdges,
    [1, 0.7, 0.22]
  );
  addInstances(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xc7b99f }),
    city.balconies,
    [1.85, 0.14, 0.55]
  );
  addInstances(
    new THREE.CylinderGeometry(0.45, 0.5, 1.2, 10),
    new THREE.MeshLambertMaterial({ color: 0xd8d5cb }),
    city.roofTanks,
    [1, 1, 1]
  );
  addInstances(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xe9e0cf }),
    city.windows,
    [1.55, 1.9, 0.18]
  );
  addInstances(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0x506b79, emissive: 0x101b20 }),
    city.windows,
    [1.12, 1.45, 0.08],
    0.14
  );

  const car = makeCar();
  car.traverse((object) => {
    if (object.isMesh) object.castShadow = true;
  });
  scene.add(car);

  // واجهة البيانات
  const meta = fc.metadata || {};
  const s = city.stats;
  $('b-total').textContent = fmt(s.buildings);
  $('b-actual').textContent = `${fmt(s.actual)} (${fmt(s.actualPct)}٪)`;
  $('b-est').textContent = `${fmt(s.estimated)} (${fmt(s.estimatedPct)}٪)`;
  $('source').textContent = meta.synthetic ? 'المصدر: بيانات تجريبية' : `المصدر: ${meta.source || 'غير محدد'}`;
  if (meta.synthetic) {
    const b = $('banner');
    b.hidden = false;
    b.textContent = '⚠ بيانات تجريبية مولّدة — ليست خريطة الزقازيق الحقيقية. لجلب بيانات OpenStreetMap شغّل: npm run data:fetch';
  } else {
    $('attribution').textContent = `${OSM_ATTRIBUTION} · الارتفاعات التقديرية موسومة بالرملي`;
  }

  // الحالة
  const initial = { x: city.spawn.x, z: city.spawn.z, h: city.spawn.h, v: 0 };
  let state = { ...initial };
  let collisionActive = false;
  let collisionUntil = 0;
  let collisionCount = 0;
  let camH = state.h;
  const camPos = new THREE.Vector3();
  const PITCH = THREE.MathUtils.degToRad(56);
  const DIST = 90;

  const angLerp = (a, b, t) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  let last = performance.now();
  let hudT = 0;
  let mapT = 0;
  const mapCanvas = $('map-canvas');
  const mapContext = mapCanvas.getContext('2d');
  const mapBounds = {
    x0: proj.project(BBOX.west, BBOX.south)[0],
    x1: proj.project(BBOX.east, BBOX.north)[0],
    z0: proj.project(BBOX.east, BBOX.north)[1],
    z1: proj.project(BBOX.west, BBOX.south)[1],
  };
  const mapPoint = (x, z) => [
    8 + ((x - mapBounds.x0) / (mapBounds.x1 - mapBounds.x0)) * (mapCanvas.width - 16),
    8 + ((z - mapBounds.z0) / (mapBounds.z1 - mapBounds.z0)) * (mapCanvas.height - 16),
  ];

  function updateMap(current) {
    const ctx = mapContext;
    ctx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    ctx.fillStyle = '#e9e5d6';
    ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, mapCanvas.width, mapCanvas.height);
    ctx.clip();

    ctx.fillStyle = '#d3c2a4';
    for (const polygon of city.buildings) {
      ctx.beginPath();
      polygon.forEach(([x, z], index) => {
        const point = mapPoint(x, z);
        if (index === 0) ctx.moveTo(...point);
        else ctx.lineTo(...point);
      });
      ctx.closePath();
      ctx.fill();
    }

    for (const road of city.roads) {
      ctx.beginPath();
      road.points.forEach(([x, z], index) => {
        const point = mapPoint(x, z);
        if (index === 0) ctx.moveTo(...point);
        else ctx.lineTo(...point);
      });
      ctx.strokeStyle = road.type === 'primary' || road.type === 'trunk' ? '#f8f5ec' : '#fffdf8';
      ctx.lineWidth = road.type === 'primary' || road.type === 'trunk' ? 4 : 2;
      ctx.stroke();
    }

    const carPoint = mapPoint(current.x, current.z);
    ctx.translate(carPoint[0], carPoint[1]);
    ctx.rotate(current.h);
    ctx.fillStyle = '#d8342a';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function nearestStreet(current) {
    let nearest = null;
    for (const road of city.roads) {
      if (!road.name) continue;
      for (let i = 0; i < road.points.length - 1; i++) {
        const [ax, az] = road.points[i];
        const [bx, bz] = road.points[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const lengthSquared = dx * dx + dz * dz;
        if (!lengthSquared) continue;
        const t = Math.max(0, Math.min(1, ((current.x - ax) * dx + (current.z - az) * dz) / lengthSquared));
        const distance = Math.hypot(current.x - ax - t * dx, current.z - az - t * dz);
        if (!nearest || distance < nearest.distance) nearest = { distance, name: road.name };
      }
    }
    $('street-name').textContent = nearest && nearest.distance < 120
      ? nearest.name
      : 'اسم الشارع غير متاح في بيانات OSM';
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (resetRequested) {
      state = { ...initial };
      collisionActive = false;
      $('collision-alert').hidden = true;
      resetRequested = false;
    }

    const previous = state;
    const input = {
      accel: (keys.up ? 1 : 0) - (keys.down ? 1 : 0),
      steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
      handbrake: keys.brake,
    };
    const holdingThrottleAfterImpact = collisionActive && keys.up && !keys.down;
    const next = holdingThrottleAfterImpact ? { ...state, v: 0 } : stepCar(state, input, dt);
    if (collisionActive) {
      if (!holdingThrottleAfterImpact && !collidesWithBuildings(next, city.buildings)) {
        collisionActive = false;
        state = next;
      } else {
        state = { ...state, v: 0 };
      }
    } else if (collidesWithBuildings(next, city.buildings)) {
      if (!collisionActive) {
        collisionCount++;
        collisionUntil = now + 2200;
        $('collision-alert').hidden = false;
      }
      collisionActive = true;
      state = { ...previous, v: 0 };
    } else {
      collisionActive = false;
      state = next;
    }
    if (now >= collisionUntil) $('collision-alert').hidden = true;

    car.position.set(state.x, 0, state.z);
    car.rotation.y = -state.h;

    camH = followHeading ? angLerp(camH, state.h, 1 - Math.exp(-3 * dt)) : -Math.PI / 2; // ثابتة: الشمال لأعلى الشاشة
    const back = DIST * Math.cos(PITCH);
    const target = new THREE.Vector3(state.x - Math.cos(camH) * back, DIST * Math.sin(PITCH), state.z - Math.sin(camH) * back);
    camPos.lerp(target, 1 - Math.exp(-6 * dt));
    camera.position.copy(camPos);
    camera.lookAt(state.x, 0, state.z);

    hudT += dt;
    if (hudT > 0.1) { hudT = 0; $('speed').textContent = fmt(Math.round(Math.abs(state.v) * 3.6)); }
    mapT += dt;
    if (mapT > 0.25) {
      mapT = 0;
      updateMap(state);
      nearestStreet(state);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  camPos.set(state.x - Math.cos(camH) * DIST * Math.cos(PITCH), DIST * Math.sin(PITCH), state.z - Math.sin(camH) * DIST * Math.cos(PITCH));
  requestAnimationFrame(frame);

  // للفحص الآلي
  updateMap(state);
  nearestStreet(state);
  window.__sim = { get state() { return state; }, get collisions() { return collisionCount; }, stats: s, build: city.build, meta, keys };
}

init().catch((e) => {
  console.error(e);
  $('banner').hidden = false;
  $('banner').textContent = 'تعذر تحميل بيانات المدينة: ' + e.message;
});
