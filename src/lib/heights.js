import { ESTIMATED_LEVELS, LEVEL_HEIGHT_M } from './config.js';

function parseHeightMeters(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  const n = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const meters = /ft|'/.test(s) ? n * 0.3048 : n;
  return meters >= 2 && meters <= 400 ? meters : null;
}

/**
 * يحدد ارتفاع المبنى ومصدره:
 *  - 'height'    : وسم height في المصدر (فعلي)
 *  - 'levels'    : وسم building:levels × ارتفاع الطابق (فعلي)
 *  - 'estimated' : لا توجد بيانات → تقدير ثابت (ESTIMATED_LEVELS طوابق)
 */
export function resolveHeight(props = {}) {
  const h = parseHeightMeters(props.height);
  if (h !== null) return { height: h, source: 'height' };

  const levels = parseFloat(props['building:levels']);
  if (Number.isFinite(levels) && levels > 0 && levels <= 200) {
    return { height: levels * LEVEL_HEIGHT_M, source: 'levels' };
  }
  return { height: ESTIMATED_LEVELS * LEVEL_HEIGHT_M, source: 'estimated' };
}

export const isActual = (source) => source === 'height' || source === 'levels';
