import type { ScoredValue, SpotInput } from "./types";
import { weights } from "./weights";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Explainable spot risk. Same inputs → same number. */
export function risk(spot: SpotInput): ScoredValue<number> {
  const terrain = clamp01(spot.lowPointScore);
  const blackspot = spot.isBlackspot
    ? clamp01(
        0.55 +
          Math.min(
            0.45,
            ((new Date().getFullYear() - (spot.blackspotSince ?? new Date().getFullYear())) /
              20) *
              0.45,
          ),
      )
    : 0.1;
  const rain = clamp01(spot.rainNext3hMm / 60);
  const tide =
    spot.coastal && spot.tideHeightM != null
      ? clamp01(spot.tideHeightM / 3)
      : 0;
  const reports = clamp01(spot.verifiedReportCount / 5);

  const value = Number(
    (
      weights.terrain * terrain +
      weights.blackspot * blackspot +
      weights.rain_3h * rain +
      weights.tide * tide +
      weights.verified_reports * reports
    ).toFixed(3),
  );

  return {
    value,
    breakdown: {
      terrain,
      blackspot,
      rain_next_3h_mm: spot.rainNext3hMm,
      rain_component: rain,
      tide_component: tide,
      verified_reports: spot.verifiedReportCount,
      reports_component: reports,
      risk: value,
    },
  };
}
