/**
 * Photo cues for flood / pothole reports.
 * Uses a trained scene classifier plus geometric gates so a dry road
 * is not treated as a credible incident.
 */
import {
  extractPhotoFeatures,
  PHOTO_SCAN_SIZE,
  type PhotoFeatures,
} from "./photo-features";
import { decideIncidentScene, predictPhotoScene, type PhotoSceneClass } from "./photo-scene-model";

export type PhotoCueResult = {
  waterDetected: boolean;
  waterScore: number;
  damageScore: number;
  damageLevel: 1 | 2 | 3 | 4 | 5;
  reason: string;
  sceneScore: number;
  looksLikeFloodOrPothole: boolean;
  sceneReason: string;
  predictedClass: PhotoSceneClass | "unknown";
  classConfidence: number;
  modelUsed: boolean;
};

export type WaterDetectResult = {
  waterDetected: boolean;
  waterScore: number;
  reason: string;
};

function levelFromDamage(score: number, waterScore: number): 1 | 2 | 3 | 4 | 5 {
  let s = score;
  if (waterScore >= 0.4) s += 0.2;
  if (s >= 0.72) return 5;
  if (s >= 0.395) return 4;
  if (s >= 0.175) return 3;
  if (s >= 0.088) return 2;
  return 1;
}

function emptyResult(reason: string, sceneReason: string): PhotoCueResult {
  return {
    waterDetected: false,
    waterScore: 0,
    damageScore: 0,
    damageLevel: 1,
    reason,
    sceneScore: 0,
    looksLikeFloodOrPothole: false,
    sceneReason,
    predictedClass: "unknown",
    classConfidence: 0,
    modelUsed: false,
  };
}

export function cuesFromFeatures(features: PhotoFeatures): PhotoCueResult {
  const prediction = predictPhotoScene(features);
  const decision = decideIncidentScene(features, prediction);
  const waterDetected = decision.looksLikeFloodOrPothole && features.waterScore >= 0.28;
  const damageLevel = levelFromDamage(features.damageScore, features.waterScore);
  const sceneScore = Number(
    Math.max(
      0,
      Math.min(
        1,
        (prediction.probs.flood + prediction.probs.pothole) * 0.7 +
          (decision.looksLikeFloodOrPothole ? 0.3 : 0),
      ),
    ).toFixed(3),
  );
  const reason = [
    waterDetected
      ? `wet/cool cue ${(features.waterScore * 100).toFixed(0)}%`
      : `dry cue ${(features.waterScore * 100).toFixed(0)}%`,
    `damage L${damageLevel} (${(features.damageScore * 100).toFixed(0)}%)`,
    `class ${prediction.modelUsed ? prediction.label : "heuristic"} ${(prediction.confidence * 100).toFixed(0)}%`,
  ].join(" · ");

  return {
    waterDetected,
    waterScore: features.waterScore,
    damageScore: features.damageScore,
    damageLevel,
    reason,
    sceneScore,
    looksLikeFloodOrPothole: decision.looksLikeFloodOrPothole,
    sceneReason: decision.sceneReason,
    predictedClass: prediction.modelUsed ? prediction.label : "unknown",
    classConfidence: prediction.confidence,
    modelUsed: prediction.modelUsed,
  };
}

export async function analyzePhotoCues(buffer: Buffer): Promise<PhotoCueResult> {
  try {
    const sharp = (await import("sharp")).default;
    const image = sharp(buffer).rotate();
    const raw = await image
      .resize(PHOTO_SCAN_SIZE, PHOTO_SCAN_SIZE, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer();
    return cuesFromFeatures(extractPhotoFeatures(raw, PHOTO_SCAN_SIZE, PHOTO_SCAN_SIZE));
  } catch {
    return emptyResult("Could not analyse image bytes", "Could not read that photo.");
  }
}

/** @deprecated prefer analyzePhotoCues — kept for existing call sites */
export async function detectWaterInPhoto(buffer: Buffer): Promise<WaterDetectResult> {
  const full = await analyzePhotoCues(buffer);
  return {
    waterDetected: full.waterDetected,
    waterScore: full.waterScore,
    reason: full.reason,
  };
}
