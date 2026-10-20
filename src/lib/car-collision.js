function pointInPolygon(point, polygon) {
  let inside = false;
  const [x, z] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const onSegment = (p, q, r) => (
    r[0] >= Math.min(p[0], q[0]) && r[0] <= Math.max(p[0], q[0]) &&
    r[1] >= Math.min(p[1], q[1]) && r[1] <= Math.max(p[1], q[1])
  );
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
      ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return (abC === 0 && onSegment(a, b, c)) ||
    (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) ||
    (cdB === 0 && onSegment(c, d, b));
}

function polygonsIntersect(a, b) {
  if (a.some((point) => pointInPolygon(point, b)) || b.some((point) => pointInPolygon(point, a))) return true;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

export function collidesWithBuildings(state, buildings, halfLength = 3.52, halfWidth = 1.52) {
  const forward = [Math.cos(state.h), Math.sin(state.h)];
  const side = [-forward[1], forward[0]];
  const car = [
    [state.x + forward[0] * halfLength + side[0] * halfWidth, state.z + forward[1] * halfLength + side[1] * halfWidth],
    [state.x + forward[0] * halfLength - side[0] * halfWidth, state.z + forward[1] * halfLength - side[1] * halfWidth],
    [state.x - forward[0] * halfLength - side[0] * halfWidth, state.z - forward[1] * halfLength - side[1] * halfWidth],
    [state.x - forward[0] * halfLength + side[0] * halfWidth, state.z - forward[1] * halfLength + side[1] * halfWidth],
  ];
  return buildings.some((building) => polygonsIntersect(car, building));
}
