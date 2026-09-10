import type { SpotInput } from "./types";
import { risk } from "./risk";

export const RAIN_CONTINUING_MM_3H = 8;

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

/** Nearby low streets while rain continues — anticipation, not a forecast. */
export function nextAtRisk(
  spots: SpotInput[],
  rainContinuing: boolean,
): Array<{ spotId: string; name: string; reason: string }> {
  if (!rainContinuing || spots.length < 2) return [];

  const scored = spots
    .map((s) => ({ spot: s, risk: risk(s).value }))
    .sort((a, b) => b.risk - a.risk);

  const seedCount = Math.min(3, scored.length);
  const seeds = scored.slice(0, seedCount);
  const hottestId = scored[0]!.spot.id;
  const out: Array<{ spotId: string; name: string; reason: string }> = [];
  const seen = new Set<string>();

  for (const seed of seeds) {
    const nearby = scored
      .filter(
        (c) =>
          c.spot.id !== hottestId &&
          c.spot.id !== seed.spot.id &&
          !seen.has(c.spot.id),
      )
      .map((c) => ({ ...c, dist: haversineM(seed.spot, c.spot) }))
      .filter((c) => c.dist <= 4000)
      .filter(
        (c) =>
          c.spot.lowPointScore + 0.02 >= seed.spot.lowPointScore ||
          c.spot.lowPointScore >= 0.72,
      )
      .sort((a, b) => {
        const elev = b.spot.lowPointScore - a.spot.lowPointScore;
        if (Math.abs(elev) > 0.02) return elev;
        return a.dist - b.dist;
      });

    for (const cand of nearby) {
      seen.add(cand.spot.id);
      const lower = cand.spot.lowPointScore > seed.spot.lowPointScore + 0.01;
      out.push({
        spotId: cand.spot.id,
        name: cand.spot.name,
        reason: lower
          ? `Lower than ${seed.spot.name} (${Math.round(cand.dist)} m); rain continuing`
          : `Next dip near ${seed.spot.name} (${Math.round(cand.dist)} m); rain continuing`,
      });
      if (out.length >= 5) return out;
    }
  }

  return out;
}
