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

/** Minimum combined flood+pothole probability to trust the model accept path. */
export const ACCEPT_MASS_MIN = 0.42;
/** Reject when the top class is non-incident and confidence is at least this. */
export const REJECT_CONFIDENCE_MIN = 0.4;
/** Heuristic-only accept needs this water/pothole corroboration when the model is weak. */
export const HEURISTIC_ACCEPT_MASS_MIN = 0.28;

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

function acceptMass(prediction: PhotoScenePrediction): number {
  return (prediction.probs.flood ?? 0) + (prediction.probs.pothole ?? 0);
}

function rejectLabelReason(label: PhotoSceneClass): string {
  if (label === "dry_road") {
    return "This looks like a normal dry road — no standing water or pothole. It was not sent to the city.";
  }
  if (label === "clothing") {
    return "Photo looks like clothing or fabric, not a flooded street or pothole.";
  }
  if (label === "indoor") {
    return "Photo looks indoor, not a flooded street or pothole.";
  }
  if (label === "nature") {
    return "Photo looks like greenery or open nature, not a flooded street or pothole.";
  }
  if (label === "sky") {
    return "Photo looks like sky, not a flooded street or pothole.";
  }
  return "Photo does not look like standing water or road damage. It was not sent to the city.";
}

export function decideIncidentScene(
  features: PhotoFeatures,
  prediction: PhotoScenePrediction,
): { looksLikeFloodOrPothole: boolean; sceneReason: string; sceneConfidence: number } {
  if (looksLikeClothingOrPerson(features)) {
    return {
      looksLikeFloodOrPothole: false,
      sceneConfidence: 0,
      sceneReason:
        features.skinRatio >= 0.24
          ? "Photo looks like a person, not a flooded street or pothole."
          : "Photo looks like clothing or a close object, not a flooded street or pothole.",
    };
  }

  const water = hasStandingWater(features);
  const pothole = hasPotholeCue(features);
  const mass = acceptMass(prediction);
  const sceneConfidence = Number(
    Math.max(
      0,
      Math.min(
        1,
        prediction.modelUsed
          ? mass * 0.75 + (water || pothole ? 0.25 : 0)
          : water || pothole
            ? 0.55
            : 0,
      ),
    ).toFixed(3),
  );

  if (prediction.modelUsed) {
    const topIsReject = !PHOTO_ACCEPT_CLASSES.has(prediction.label);
    const strongReject =
      topIsReject && prediction.confidence >= REJECT_CONFIDENCE_MIN && mass < ACCEPT_MASS_MIN;

    // Strong geometric water / pothole evidence can override a synthetic-model miss
    // (real murky floods often look unlike the cool-blue training scenes).
    const strongHeuristic =
      (water && features.waterScore >= 0.28 && features.skinRatio < 0.2) ||
      (water && features.murkyRatio >= 0.16 && features.lowerCoolRatio >= 0.1 && features.skinRatio < 0.18) ||
      (pothole && features.holePeak >= 0.32 && features.asphaltRatio >= 0.12);

    if (strongHeuristic) {
      return {
        looksLikeFloodOrPothole: true,
        sceneConfidence: Number(
          Math.max(
            sceneConfidence,
            Math.min(0.82, features.waterScore * 0.7 + (pothole ? 0.35 : 0.2)),
          ).toFixed(3),
        ),
        sceneReason: water
          ? `Looks like standing water on a street (water ${(features.waterScore * 100).toFixed(0)}%).`
          : `Looks like a broken-road / pothole photo (road ${(features.asphaltRatio * 100).toFixed(0)}%, hole ${(features.holePeak * 100).toFixed(0)}%).`,
      };
    }

    if (strongReject) {
      return {
        looksLikeFloodOrPothole: false,
        sceneConfidence,
        sceneReason: rejectLabelReason(prediction.label),
      };
    }

    if (PHOTO_ACCEPT_CLASSES.has(prediction.label) && prediction.confidence >= 0.38) {
      if (water || pothole || mass >= ACCEPT_MASS_MIN) {
        return {
          looksLikeFloodOrPothole: true,
          sceneConfidence: Math.max(sceneConfidence, prediction.confidence),
          sceneReason:
            prediction.label === "flood"
              ? `Looks like standing water on a street (model ${(prediction.confidence * 100).toFixed(0)}%).`
              : `Looks like a broken-road / pothole photo (model ${(prediction.confidence * 100).toFixed(0)}%).`,
        };
      }
    }

    if (mass >= ACCEPT_MASS_MIN && (water || pothole)) {
      return {
        looksLikeFloodOrPothole: true,
        sceneConfidence,
        sceneReason: water
          ? `Looks like standing water on a street (water ${(features.waterScore * 100).toFixed(0)}%).`
          : `Looks like a broken-road / pothole photo (road ${(features.asphaltRatio * 100).toFixed(0)}%, hole ${(features.holePeak * 100).toFixed(0)}%).`,
      };
    }

    // Heuristics alone are not enough when the model is loaded — stops dry roads / junk reaching admin.
    if (!water && !pothole) {
      if (features.asphaltRatio >= 0.14) {
        return {
          looksLikeFloodOrPothole: false,
          sceneConfidence,
          sceneReason:
            "This looks like a normal road — no standing water or pothole. It was not sent to the city.",
        };
      }
      return {
        looksLikeFloodOrPothole: false,
        sceneConfidence,
        sceneReason: "Photo does not look like standing water or road damage.",
      };
    }

    if (mass < HEURISTIC_ACCEPT_MASS_MIN) {
      return {
        looksLikeFloodOrPothole: false,
        sceneConfidence,
        sceneReason: rejectLabelReason(topIsReject ? prediction.label : "object"),
      };
    }

    return {
      looksLikeFloodOrPothole: true,
      sceneConfidence,
      sceneReason: water
        ? `Looks like standing water on a street (water ${(features.waterScore * 100).toFixed(0)}%).`
        : `Looks like a broken-road / pothole photo (road ${(features.asphaltRatio * 100).toFixed(0)}%, hole ${(features.holePeak * 100).toFixed(0)}%).`,
    };
  }

  // No trained weights — heuristic fallback only.
  if (!water && !pothole) {
    if (features.asphaltRatio >= 0.14) {
      return {
        looksLikeFloodOrPothole: false,
        sceneConfidence: 0,
        sceneReason:
          "This looks like a normal road — no standing water or pothole. It was not sent to the city.",
      };
    }
    return {
      looksLikeFloodOrPothole: false,
      sceneConfidence: 0,
      sceneReason: "Photo does not look like standing water or road damage.",
    };
  }

  if (water) {
    return {
      looksLikeFloodOrPothole: true,
      sceneConfidence: 0.55,
      sceneReason: `Looks like standing water on a street (water ${(features.waterScore * 100).toFixed(0)}%).`,
    };
  }
  return {
    looksLikeFloodOrPothole: true,
    sceneConfidence: 0.55,
    sceneReason: `Looks like a broken-road / pothole photo (road ${(features.asphaltRatio * 100).toFixed(0)}%, hole ${(features.holePeak * 100).toFixed(0)}%).`,
  };
}
