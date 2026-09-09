import type { ScoredValue, Severity, SeverityInput } from "./types";

export function severity(input: SeverityInput): ScoredValue<Severity> {
  const breakdown: Record<string, number | string> = {
    depthCue: input.depthCue,
    nearbyVerifiedReports: input.nearbyVerifiedReports,
    rainIntensityMm1h: input.rainIntensityMm1h,
  };

  let level: Severity = "minor";
  if (input.depthCue === "vehicle" || input.nearbyVerifiedReports >= 3) {
    level = "impassable";
  } else if (
    input.depthCue === "knee" ||
    input.nearbyVerifiedReports >= 2 ||
    input.rainIntensityMm1h >= 12
  ) {
    level = "moderate";
  } else if (input.depthCue === "ankle" || input.rainIntensityMm1h >= 5) {
    level = "minor";
  }

  if (input.rainIntensityMm1h >= 20 && level === "minor") level = "moderate";
  if (input.rainIntensityMm1h >= 30 && level !== "impassable") level = "impassable";

  breakdown.severity = level;
  return { value: level, breakdown };
}
