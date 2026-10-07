import { apply, tr, type Mat, type Pt } from "./print";

export interface Limb { hip: Pt; knee: Pt; foot: Pt; phase: number }

// Map a segment onto its posed endpoints. Shared endpoints keep the knee
// connected; foot placement is independent of the body's breathing/weight shift.
export function segmentPose(a: Pt, b: Pt, toA: Pt, toB: Pt): Mat {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  if (!length2) return tr(toA[0] - a[0], toA[1] - a[1]);
  const tx = toB[0] - toA[0], ty = toB[1] - toA[1];
  const c = (dx * tx + dy * ty) / length2, s = (dx * ty - dy * tx) / length2;
  return [c, s, -s, c, toA[0] - c * a[0] + s * a[1], toA[1] - s * a[0] - c * a[1]];
}

export function limbPose(limb: Limb, segment: "upper" | "lower" | "joint", body: Mat, time: number, amount = 1): Mat {
  const hip = apply(body, ...limb.hip);
  // Alternating short steps, with the foot planted for most of each cycle.
  const lift = Math.max(0, Math.sin(time + limb.phase) - 0.55) / 0.45 * amount;
  const foot: Pt = [limb.foot[0] + lift * 2, limb.foot[1] - lift * 5];
  const knee: Pt = [limb.knee[0] + (hip[0] - limb.hip[0]) * 0.55 + lift,
    limb.knee[1] + (hip[1] - limb.hip[1]) * 0.55 - lift * 3];
  if (segment === "joint") return tr(knee[0] - limb.knee[0], knee[1] - limb.knee[1]);
  return segment === "upper" ? segmentPose(limb.hip, limb.knee, hip, knee) : segmentPose(limb.knee, limb.foot, knee, foot);
}
