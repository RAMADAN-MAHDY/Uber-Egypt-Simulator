export const CAR_PARAMS = {
  accel: 9,
  brake: 22,
  reverseAccel: 5,
  maxForward: 50, // م/ث ≈ 79 كم/س
  maxReverse: 6,
  drag: 0.35,
  wheelbase: 2.7,
  maxSteer: 0.6, // راديان
  steerFalloff: 12,
};

/**
 * نموذج حركة مبسط (kinematic bicycle).
 * الحالة: { x, z, h, v } حيث h اتجاه الحركة (راديان): الأمام = (cos h, sin h) في المستوى XZ.
 * steer > 0 = يمين (يزيد h)، accel > 0 = تسارع للأمام، accel < 0 = فرامل/رجوع.
 */
export function stepCar(s, input, dt, P = CAR_PARAMS) {
  let { x, z, h, v } = s;
  const accel = Math.max(-1, Math.min(1, input.accel || 0));
  const steer = Math.max(-1, Math.min(1, input.steer || 0));

  let a = 0;
  if (accel > 0) a = v < 0 ? P.brake : P.accel * accel;
  else if (accel < 0) a = v > 0 ? -P.brake : -P.reverseAccel;
  if (input.handbrake) a = v > 0 ? -P.brake : v < 0 ? P.brake : 0;

  a -= v * P.drag;
  v += a * dt;
  if (!accel && Math.abs(v) < 0.2) v = 0;
  v = Math.max(-P.maxReverse, Math.min(P.maxForward, v));

  const steerAngle = (steer * P.maxSteer) / (1 + Math.abs(v) / P.steerFalloff);
  h += (v / P.wheelbase) * Math.tan(steerAngle) * dt;
  x += Math.cos(h) * v * dt;
  z += Math.sin(h) * v * dt;
  return { x, z, h, v };
}
