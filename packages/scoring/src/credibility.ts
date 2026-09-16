import type { ReportCredibilityInput, ScoredValue } from "./types";

/** 0–1 credibility. Never call this "fake detection". Photo evidence is required for a high score. */
export function credibility(input: ReportCredibilityInput): ScoredValue<number> {
  let score = 0.15;
  const breakdown: Record<string, number | boolean | string> = {
    base: 0.15,
    hasPhoto: input.hasPhoto,
    waterDetected: input.waterDetected,
    hasGps: input.hasGps,
    duplicateHit: input.duplicateHit,
    distanceMeters: input.distanceMeters,
    ageMinutes: input.ageMinutes,
  };

  const sceneOk = input.sceneMatch !== false;
  const sceneConfidence = Math.max(0, Math.min(1, input.sceneConfidence ?? (sceneOk ? 0.7 : 0)));
  breakdown.sceneMatch = sceneOk;
  breakdown.sceneConfidence = sceneConfidence;

  if (input.hasPhoto && sceneOk) {
    // Photo bonus scales with how strongly the scene looks like flood/pothole.
    // Weak / conflicting scenes no longer land near 0.8 from GPS alone.
    const photoBonus = 0.12 + sceneConfidence * 0.28;
    score += photoBonus;
    breakdown.photoBonus = Number(photoBonus.toFixed(3));
  } else if (input.hasPhoto && !sceneOk) {
    score -= 0.28;
    breakdown.photoRejected = true;
  } else {
    score -= 0.15;
    breakdown.photoPenalty = true;
  }

  // Water signal only counts when a matching flood/pothole photo exists.
  if (input.hasPhoto && sceneOk && input.waterDetected) {
    const waterBonus = 0.12 + sceneConfidence * 0.14;
    score += waterBonus;
    breakdown.waterBonus = Number(waterBonus.toFixed(3));
  } else if (!input.hasPhoto && input.waterDetected) {
    breakdown.waterIgnoredWithoutPhoto = true;
  }

  if (input.hasGps) score += 0.08;
  if (input.distanceMeters <= 150) score += 0.12;
  else if (input.distanceMeters <= 400) score += 0.05;
  else score -= 0.15;

  if (input.ageMinutes <= 60) score += 0.08;
  else if (input.ageMinutes <= 360) score += 0.04;
  else score -= 0.1;

  if (input.duplicateHit) score -= 0.35;

  // Soft cap: without a strong scene, credibility stays mid-range even with perfect GPS.
  if (input.hasPhoto && sceneOk && sceneConfidence < 0.55) {
    score = Math.min(score, 0.62);
    breakdown.weakSceneCap = true;
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(3))));
  breakdown.score = score;
  return { value: score, breakdown };
}
