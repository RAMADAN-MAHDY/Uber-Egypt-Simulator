import { CENTER } from './config.js';

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON_EQ = 111320;

/**
 * إسقاط محلي مبسط (equirectangular) إلى أمتار حول نقطة مرجعية.
 * x = شرقًا، z = جنوبًا (الشمال باتجاه -z). مناسب لمناطق صغيرة (أقل من بضعة كم).
 */
export function makeProjector(lat0 = CENTER.lat, lon0 = CENTER.lon) {
  const kx = M_PER_DEG_LON_EQ * Math.cos((lat0 * Math.PI) / 180);
  return {
    project: (lon, lat) => [(lon - lon0) * kx, -(lat - lat0) * M_PER_DEG_LAT],
    unproject: (x, z) => [lon0 + x / kx, lat0 - z / M_PER_DEG_LAT],
  };
}
