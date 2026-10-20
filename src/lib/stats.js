import { resolveHeight, isActual } from './heights.js';

/** إحصاءات قابلة للتحقق من ملف GeoJSON (دون افتراض اكتمال البيانات). */
export function computeStats(fc) {
  let roads = 0;
  let buildings = 0;
  let withHeightTag = 0;
  let withLevelsTag = 0;
  let actual = 0;
  let estimated = 0;
  for (const f of fc.features || []) {
    const p = f.properties || {};
    const t = f.geometry && f.geometry.type;
    if (t === 'LineString' && p.highway) roads++;
    else if (t === 'Polygon' && p.building) {
      buildings++;
      const { source } = resolveHeight(p);
      if (source === 'height') withHeightTag++;
      if (source === 'levels') withLevelsTag++;
      if (isActual(source)) actual++;
      else estimated++;
    }
  }
  const pct = (n) => (buildings ? Math.round((n / buildings) * 1000) / 10 : 0);
  return {
    roads,
    buildings,
    withHeightTag,
    withLevelsTag,
    actual,
    estimated,
    actualPct: pct(actual),
    estimatedPct: pct(estimated),
  };
}
