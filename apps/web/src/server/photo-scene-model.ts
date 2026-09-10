import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./paths";
import {
  featuresToVector,
  hasPotholeCue,
  hasStandingWater,
  looksLikeClothingOrPerson,
  type PhotoFeatures,
} from "./photo-features";

export const PHOTO_SCENE_CLASSES = [
  "flood",
  "pothole",
  "dry_road",
  "indoor",
  "clothing",
  "nature",
  "object",
  "sky",
] as const;

export type PhotoSceneClass = (typeof PHOTO_SCENE_CLASSES)[number];

export const PHOTO_ACCEPT_CLASSES: ReadonlySet<PhotoSceneClass> = new Set(["flood", "pothole"]);

export type PhotoSceneWeights = {
  version: number;
  featureNames: string[];
  classes: PhotoSceneClass[];
  scalerMean: number[];
  scalerScale: number[];
  hidden: number;
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
};

export type PhotoScenePrediction = {
  label: PhotoSceneClass;
  confidence: number;
  probs: Record<PhotoSceneClass, number>;
  modelUsed: boolean;
};

let cachedWeights: PhotoSceneWeights | null | undefined;

export function photoSceneWeightsPath(): string {
  return path.join(dataDir(), "models", "photo-scene", "weights.json");
}

export function loadPhotoSceneWeights(): PhotoSceneWeights | null {
  if (cachedWeights !== undefined) return cachedWeights;
  const file = photoSceneWeightsPath();
  if (!existsSync(file)) {
    cachedWeights = null;
    return null;
  }
  try {
    cachedWeights = JSON.parse(readFileSync(file, "utf8")) as PhotoSceneWeights;
    return cachedWeights;
  } catch {
    cachedWeights = null;
    return null;
  }
}

function relu(n: number): number {
  return n > 0 ? n : 0;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((v) => v / sum);
}

function forwardMlp(vector: number[], weights: PhotoSceneWeights): number[] {
  const hidden = weights.b1.map((bias, i) => {
    const row = weights.w1[i] ?? [];
    let sum = bias;
    for (let j = 0; j < vector.length; j++) sum += (row[j] ?? 0) * (vector[j] ?? 0);
    return relu(sum);
  });
  const logits = weights.b2.map((bias, i) => {
    const row = weights.w2[i] ?? [];
    let sum = bias;
    for (let j = 0; j < hidden.length; j++) sum += (row[j] ?? 0) * (hidden[j] ?? 0);
    return sum;
  });
  return softmax(logits);
}

export function predictPhotoScene(
  features: PhotoFeatures,
  weights = loadPhotoSceneWeights(),
): PhotoScenePrediction {
  const emptyProbs = Object.fromEntries(PHOTO_SCENE_CLASSES.map((c) => [c, 0])) as Record<
    PhotoSceneClass,
    number
  >;
  if (!weights || weights.classes.length !== PHOTO_SCENE_CLASSES.length) {
    return {
      label: "object",
      confidence: 0,
      probs: emptyProbs,
      modelUsed: false,
    };
  }

  const raw = featuresToVector(features);
  const vector = raw.map((v, i) => {
    const scale = weights.scalerScale[i] || 1;
    return (v - (weights.scalerMean[i] ?? 0)) / scale;
  });
  const probsArr = forwardMlp(vector, weights);
  const probs = { ...emptyProbs };
  let bestIdx = 0;
  for (let i = 0; i < PHOTO_SCENE_CLASSES.length; i++) {
    const cls = PHOTO_SCENE_CLASSES[i]!;
    const p = probsArr[i] ?? 0;
    probs[cls] = Number(p.toFixed(4));
    if (p > (probsArr[bestIdx] ?? -1)) bestIdx = i;
  }
  const label = PHOTO_SCENE_CLASSES[bestIdx] ?? "object";
  return {
    label,
    confidence: probs[label] ?? 0,
    probs,
    modelUsed: true,
  };
}

export function decideIncidentScene(
  features: PhotoFeatures,
  prediction: PhotoScenePrediction,
): { looksLikeFloodOrPothole: boolean; sceneReason: string } {
  if (looksLikeClothingOrPerson(features)) {
    return {
      looksLikeFloodOrPothole: false,
      sceneReason:
        features.skinRatio >= 0.24
          ? "Photo looks like a person, not a flooded street or pothole."
          : "Photo looks like clothing or a close object, not a flooded street or pothole.",
    };
  }

  const water = hasStandingWater(features);
  const pothole = hasPotholeCue(features);

  if (!water && !pothole) {
    if (features.asphaltRatio >= 0.14) {
      return {
        looksLikeFloodOrPothole: false,
        sceneReason:
          "This looks like a normal road — no standing water or pothole. It was not sent to the city.",
      };
    }
    return {
      looksLikeFloodOrPothole: false,
      sceneReason: "Photo does not look like standing water or road damage.",
    };
  }

  if (
    prediction.modelUsed &&
    !water &&
    (prediction.label === "indoor" || prediction.label === "clothing") &&
    prediction.confidence >= 0.55
  ) {
    return {
      looksLikeFloodOrPothole: false,
      sceneReason: `Photo looks like ${prediction.label.replace("_", " ")}, not a flooded street or pothole.`,
    };
  }

  if (water) {
    return {
      looksLikeFloodOrPothole: true,
      sceneReason: `Looks like standing water on a street (water ${(features.waterScore * 100).toFixed(0)}%).`,
    };
  }
  return {
    looksLikeFloodOrPothole: true,
    sceneReason: `Looks like a broken-road / pothole photo (road ${(features.asphaltRatio * 100).toFixed(0)}%, hole ${(features.holePeak * 100).toFixed(0)}%).`,
  };
}
