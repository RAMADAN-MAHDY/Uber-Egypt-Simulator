const WIDTHS = {
  motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 8,
  unclassified: 6, residential: 6, living_street: 5, service: 4,
};

export function roadWidth(highway = '') {
  const base = String(highway).replace('_link', '');
  return WIDTHS[base] ?? 5;
}

/**
 * شريط (ribbon) لطريق من نقاط [x,z] بعرض معين، مع تنعيم بسيط عند المنعطفات.
 * يعيد { positions: number[] (xyz), indices: number[] } عند الارتفاع y.
 */
export function ribbon(points, width, y = 0.06) {
  const n = points.length;
  const positions = [];
  const indices = [];
  if (n < 2) return { positions, indices };
  const half = width / 2;

  const segNormal = (a, b) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return [-dz / len, dx / len];
  };

  for (let i = 0; i < n; i++) {
    let nx;
    let nz;
    let scale = 1;
    if (i === 0) [nx, nz] = segNormal(points[0], points[1]);
    else if (i === n - 1) [nx, nz] = segNormal(points[n - 2], points[n - 1]);
    else {
      const a = segNormal(points[i - 1], points[i]);
      const b = segNormal(points[i], points[i + 1]);
      nx = a[0] + b[0];
      nz = a[1] + b[1];
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      const d = nx * a[0] + nz * a[1];
      scale = 1 / Math.max(d, 0.5);
    }
    const [px, pz] = points[i];
    positions.push(px + nx * half * scale, y, pz + nz * half * scale);
    positions.push(px - nx * half * scale, y, pz - nz * half * scale);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { positions, indices };
}
