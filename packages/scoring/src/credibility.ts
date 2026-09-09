import type { ReportCredibilityInput, ScoredValue } from "./types";

/** 0–1 credibility. Never call this "fake detection". Photo evidence is required for a high score. */
export function credibility(input: ReportCredibilityInput): ScoredValue<number> {
  let score = 0.2;
  const breakdown: Record<string, number | boolean | string> = {
    base: 0.2,
    hasPhoto: input.hasPhoto,
    waterDetected: input.waterDetected,
    hasGps: input.hasGps,
    duplicateHit: input.duplicateHit,
    distanceMeters: input.distanceMeters,
    ageMinutes: input.ageMinutes,
  };

  if (input.hasPhoto) {
    score += 0.3;
  } else {
    score -= 0.15;
    breakdown.photoPenalty = true;
  }

  // Water signal only counts when a photo exists (otherwise checkbox is unchecked noise).
  if (input.hasPhoto && input.waterDetected) score += 0.25;
  else if (!input.hasPhoto && input.waterDetected) {
    breakdown.waterIgnoredWithoutPhoto = true;
  }

  if (input.hasGps) score += 0.1;
  if (input.distanceMeters <= 150) score += 0.15;
  else if (input.distanceMeters <= 400) score += 0.05;
  else score -= 0.15;

  if (input.ageMinutes <= 60) score += 0.1;
  else if (input.ageMinutes <= 360) score += 0.05;
  else score -= 0.1;

  if (input.duplicateHit) score -= 0.35;

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  breakdown.score = score;
  return { value: score, breakdown };
}
