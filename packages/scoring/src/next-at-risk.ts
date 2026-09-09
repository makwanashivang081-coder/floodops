import type { SpotInput } from "./types";
import { risk } from "./risk";

function haversineM(a: SpotInput, b: SpotInput): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearby lower spots while rain continues — anticipation, not prediction. */
export function nextAtRisk(
  spots: SpotInput[],
  rainContinuing: boolean,
): Array<{ spotId: string; reason: string }> {
  if (!rainContinuing || spots.length === 0) return [];

  const scored = spots
    .map((s) => ({ spot: s, risk: risk(s).value }))
    .sort((a, b) => b.risk - a.risk);

  const top = scored[0];
  if (!top) return [];

  const out: Array<{ spotId: string; reason: string }> = [];
  for (const cand of scored.slice(1)) {
    const dist = haversineM(top.spot, cand.spot);
    if (dist > 3500) continue;
    // higher lowPointScore = lower ground in our proxy
    if (cand.spot.lowPointScore <= top.spot.lowPointScore) continue;
    out.push({
      spotId: cand.spot.id,
      reason: `Lower than ${top.spot.name} (${Math.round(dist)} m); rain continuing`,
    });
    if (out.length >= 5) break;
  }
  return out;
}
