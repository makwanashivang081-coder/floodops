/**
 * Build ≥10k labelled scene photos, train a small MLP, store data + weights.
 *
 * Usage (from apps/web): pnpm train:photos
 */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import sharp from "sharp";
import { dataDir, repoRoot } from "../src/server/paths";
import {
  extractPhotoFeatures,
  featuresToVector,
  PHOTO_FEATURE_NAMES,
  PHOTO_SCAN_SIZE,
} from "../src/server/photo-features";
import {
  PHOTO_SCENE_CLASSES,
  type PhotoSceneClass,
  type PhotoSceneWeights,
} from "../src/server/photo-scene-model";
import {
  generateScene,
  mulberry32,
  PHOTO_TRAIN_COUNTS,
} from "./photo-scene-generate";

const SIZE = PHOTO_SCAN_SIZE;
const HIDDEN = 48;
const SEED = 42;
const SAMPLE_PER_CLASS = 8;

type Sample = {
  id: string;
  label: PhotoSceneClass;
  vector: number[];
  path: string;
};

function relu(n: number): number {
  return n > 0 ? n : 0;
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((v) => v / sum);
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function randn(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function argmax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if ((values[i] ?? 0) > (values[best] ?? 0)) best = i;
  return best;
}

function scalerFit(rows: number[][]): { mean: number[]; scale: number[] } {
  const dim = rows[0]?.length ?? 0;
  const mean = zeros(dim);
  const scale = zeros(dim);
  for (const row of rows) {
    for (let i = 0; i < dim; i++) mean[i]! += row[i] ?? 0;
  }
  const n = Math.max(1, rows.length);
  for (let i = 0; i < dim; i++) mean[i]! /= n;
  for (const row of rows) {
    for (let i = 0; i < dim; i++) {
      const d = (row[i] ?? 0) - mean[i]!;
      scale[i]! += d * d;
    }
  }
  for (let i = 0; i < dim; i++) {
    scale[i] = Math.sqrt(scale[i]! / n) || 1;
  }
  return { mean, scale };
}

function applyScaler(row: number[], mean: number[], scale: number[]): number[] {
  return row.map((v, i) => (v - (mean[i] ?? 0)) / (scale[i] || 1));
}

type Mlp = {
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
};

function initMlp(input: number, hidden: number, classes: number, rng: () => number): Mlp {
  const he1 = Math.sqrt(2 / input);
  const he2 = Math.sqrt(2 / hidden);
  return {
    w1: Array.from({ length: hidden }, () => Array.from({ length: input }, () => randn(rng) * he1)),
    b1: zeros(hidden),
    w2: Array.from({ length: classes }, () => Array.from({ length: hidden }, () => randn(rng) * he2)),
    b2: zeros(classes),
  };
}

function trainMlp(
  x: number[][],
  y: number[],
  input: number,
  hidden: number,
  classes: number,
  rng: () => number,
): Mlp {
  const mlp = initMlp(input, hidden, classes, rng);
  const lr = 0.008;
  const l2 = 0.0004;
  const epochs = 28;
  const batch = 64;
  const n = x.length;

  const mW1 = mlp.w1.map((row) => row.map(() => 0));
  const vW1 = mlp.w1.map((row) => row.map(() => 0));
  const mB1 = zeros(hidden);
  const vB1 = zeros(hidden);
  const mW2 = mlp.w2.map((row) => row.map(() => 0));
  const vW2 = mlp.w2.map((row) => row.map(() => 0));
  const mB2 = zeros(classes);
  const vB2 = zeros(classes);
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;
  let step = 0;

  const adam = (m: number, v: number, g: number, t: number): { m: number; v: number; d: number } => {
    const nm = beta1 * m + (1 - beta1) * g;
    const nv = beta2 * v + (1 - beta2) * g * g;
    const mhat = nm / (1 - beta1 ** t);
    const vhat = nv / (1 - beta2 ** t);
    return { m: nm, v: nv, d: (lr * mhat) / (Math.sqrt(vhat) + eps) };
  };

  for (let epoch = 0; epoch < epochs; epoch++) {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }
    for (let start = 0; start < n; start += batch) {
      step += 1;
      const end = Math.min(n, start + batch);
      const gW1 = mlp.w1.map((row) => row.map(() => 0));
      const gB1 = zeros(hidden);
      const gW2 = mlp.w2.map((row) => row.map(() => 0));
      const gB2 = zeros(classes);
      const count = end - start;

      for (let k = start; k < end; k++) {
        const xi = x[order[k]!]!;
        const yi = y[order[k]!]!;
        const h = mlp.b1.map((bias, i) => {
          let s = bias;
          const row = mlp.w1[i]!;
          for (let j = 0; j < input; j++) s += row[j]! * xi[j]!;
          return relu(s);
        });
        const logits = mlp.b2.map((bias, c) => {
          let s = bias;
          const row = mlp.w2[c]!;
          for (let j = 0; j < hidden; j++) s += row[j]! * h[j]!;
          return s;
        });
        const probs = softmax(logits);
        const dlogits = probs.map((p, c) => p - (c === yi ? 1 : 0));
        const dh = zeros(hidden);
        for (let c = 0; c < classes; c++) {
          const row = mlp.w2[c]!;
          for (let j = 0; j < hidden; j++) {
            gW2[c]![j]! += dlogits[c]! * h[j]!;
            dh[j]! += row[j]! * dlogits[c]!;
          }
          gB2[c]! += dlogits[c]!;
        }
        for (let j = 0; j < hidden; j++) {
          if (h[j]! <= 0) dh[j] = 0;
          const row = mlp.w1[j]!;
          for (let i = 0; i < input; i++) gW1[j]![i]! += dh[j]! * xi[i]!;
          gB1[j]! += dh[j]!;
        }
      }

      for (let i = 0; i < hidden; i++) {
        for (let j = 0; j < input; j++) {
          const g = gW1[i]![j]! / count + l2 * mlp.w1[i]![j]!;
          const u = adam(mW1[i]![j]!, vW1[i]![j]!, g, step);
          mW1[i]![j] = u.m;
          vW1[i]![j] = u.v;
          mlp.w1[i]![j]! -= u.d;
        }
        const u = adam(mB1[i]!, vB1[i]!, gB1[i]! / count, step);
        mB1[i] = u.m;
        vB1[i] = u.v;
        mlp.b1[i]! -= u.d;
      }
      for (let c = 0; c < classes; c++) {
        for (let j = 0; j < hidden; j++) {
          const g = gW2[c]![j]! / count + l2 * mlp.w2[c]![j]!;
          const u = adam(mW2[c]![j]!, vW2[c]![j]!, g, step);
          mW2[c]![j] = u.m;
          vW2[c]![j] = u.v;
          mlp.w2[c]![j]! -= u.d;
        }
        const u = adam(mB2[c]!, vB2[c]!, gB2[c]! / count, step);
        mB2[c] = u.m;
        vB2[c] = u.v;
        mlp.b2[c]! -= u.d;
      }
    }
    if ((epoch + 1) % 7 === 0) {
      let correct = 0;
      for (let i = 0; i < n; i++) {
        const xi = x[i]!;
        const h = mlp.b1.map((bias, r) => {
          let s = bias;
          const row = mlp.w1[r]!;
          for (let j = 0; j < input; j++) s += row[j]! * xi[j]!;
          return relu(s);
        });
        const logits = mlp.b2.map((bias, c) => {
          let s = bias;
          const row = mlp.w2[c]!;
          for (let j = 0; j < hidden; j++) s += row[j]! * h[j]!;
          return s;
        });
        if (argmax(softmax(logits)) === y[i]) correct += 1;
      }
      console.log(`  epoch ${epoch + 1}/${epochs} train-acc ${(correct / n).toFixed(3)}`);
    }
  }
  return mlp;
}

function evaluate(mlp: Mlp, x: number[][], y: number[], classes: readonly string[]) {
  const confusion: Record<string, Record<string, number>> = {};
  for (const a of classes) {
    confusion[a] = Object.fromEntries(classes.map((b) => [b, 0]));
  }
  let correct = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const h = mlp.b1.map((bias, r) => {
      let s = bias;
      const row = mlp.w1[r]!;
      for (let j = 0; j < xi.length; j++) s += row[j]! * xi[j]!;
      return relu(s);
    });
    const logits = mlp.b2.map((bias, c) => {
      let s = bias;
      const row = mlp.w2[c]!;
      for (let j = 0; j < h.length; j++) s += row[j]! * h[j]!;
      return s;
    });
    const pred = argmax(softmax(logits));
    const actual = y[i]!;
    if (pred === actual) correct += 1;
    const aName = classes[actual] ?? "unknown";
    const pName = classes[pred] ?? "unknown";
    confusion[aName]![pName]! += 1;
  }
  const perClass: Record<string, number> = {};
  for (const cls of classes) {
    const row = confusion[cls]!;
    const total = Object.values(row).reduce((a, b) => a + b, 0);
    perClass[cls] = total ? (row[cls] ?? 0) / total : 0;
  }
  return { accuracy: x.length ? correct / x.length : 0, confusion, perClass };
}

async function main(): Promise<void> {
  const root = repoRoot();
  const datasetDir = path.join(dataDir(), "validation", "photo_train_set");
  const imagesDir = path.join(datasetDir, "images");
  const samplesDir = path.join(datasetDir, "samples");
  const modelDir = path.join(dataDir(), "models", "photo-scene");
  await mkdir(samplesDir, { recursive: true });
  await mkdir(modelDir, { recursive: true });

  const total = Object.values(PHOTO_TRAIN_COUNTS).reduce((a, b) => a + b, 0);
  console.log(`Generating ${total} labelled photos (${SIZE}x${SIZE})…`);

  const rng = mulberry32(SEED);
  const samples: Sample[] = [];
  const t0 = Date.now();

  for (const label of PHOTO_SCENE_CLASSES) {
    const count = PHOTO_TRAIN_COUNTS[label];
    const classDir = path.join(imagesDir, label);
    await mkdir(classDir, { recursive: true });
    const writes: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      const id = `${label}-${String(i + 1).padStart(5, "0")}`;
      const raw = generateScene(label, SIZE, rng);
      const rel = path.join("images", label, `${id}.jpg`).replaceAll("\\", "/");
      const abs = path.join(datasetDir, rel);
      const keepSample = i < SAMPLE_PER_CLASS;
      writes.push(
        sharp(Buffer.from(raw), { raw: { width: SIZE, height: SIZE, channels: 3 } })
          .jpeg({ quality: 62 })
          .toFile(abs)
          .then(async () => {
            if (keepSample) {
              await copyFile(abs, path.join(samplesDir, `${id}.jpg`));
            }
          })
          .then(() => undefined),
      );
      const features = extractPhotoFeatures(raw, SIZE, SIZE);
      samples.push({ id, label, vector: featuresToVector(features), path: rel });
      if (writes.length >= 80) {
        await Promise.all(writes);
        writes.length = 0;
      }
    }
    if (writes.length) await Promise.all(writes);
    console.log(`  ${label}: ${count}`);
  }

  console.log(`Wrote images in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const order = Array.from({ length: samples.length }, (_, i) => i);
  const splitRng = mulberry32(SEED + 7);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(splitRng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const split = new Map<string, "train" | "val">();
  const valN = Math.floor(samples.length * 0.2);
  for (let i = 0; i < order.length; i++) {
    const s = samples[order[i]!]!;
    split.set(s.id, i < valN ? "val" : "train");
  }

  const labelsPath = path.join(datasetDir, "labels.csv");
  const featuresPath = path.join(datasetDir, "features.csv");
  const labelOut = createWriteStream(labelsPath);
  const featOut = createWriteStream(featuresPath);
  labelOut.write("id,label,split,path,accept\n");
  featOut.write(["id", "label", "split", ...PHOTO_FEATURE_NAMES].join(",") + "\n");
  for (const s of samples) {
    const part = split.get(s.id) ?? "train";
    const accept = s.label === "flood" || s.label === "pothole" ? 1 : 0;
    labelOut.write(`${s.id},${s.label},${part},${s.path},${accept}\n`);
    featOut.write([s.id, s.label, part, ...s.vector.map((v) => v.toFixed(4))].join(",") + "\n");
  }
  await new Promise<void>((resolve, reject) => {
    labelOut.end(() => resolve());
    labelOut.on("error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    featOut.end(() => resolve());
    featOut.on("error", reject);
  });

  const train = samples.filter((s) => split.get(s.id) === "train");
  const val = samples.filter((s) => split.get(s.id) === "val");
  const { mean, scale } = scalerFit(train.map((s) => s.vector));
  const xTrain = train.map((s) => applyScaler(s.vector, mean, scale));
  const yTrain = train.map((s) => PHOTO_SCENE_CLASSES.indexOf(s.label));
  const xVal = val.map((s) => applyScaler(s.vector, mean, scale));
  const yVal = val.map((s) => PHOTO_SCENE_CLASSES.indexOf(s.label));

  console.log(`Training MLP on ${train.length} rows, hidden=${HIDDEN}…`);
  const mlp = trainMlp(
    xTrain,
    yTrain,
    PHOTO_FEATURE_NAMES.length,
    HIDDEN,
    PHOTO_SCENE_CLASSES.length,
    mulberry32(SEED + 99),
  );
  const trainMetrics = evaluate(mlp, xTrain, yTrain, PHOTO_SCENE_CLASSES);
  const valMetrics = evaluate(mlp, xVal, yVal, PHOTO_SCENE_CLASSES);
  console.log(`Train accuracy ${trainMetrics.accuracy.toFixed(3)} · val accuracy ${valMetrics.accuracy.toFixed(3)}`);
  console.log("Val per-class recall", valMetrics.perClass);

  const weights: PhotoSceneWeights & {
    createdAt: string;
    nTrain: number;
    nVal: number;
    nTotal: number;
    seed: number;
    scanSize: number;
  } = {
    version: 1,
    createdAt: new Date().toISOString(),
    nTrain: train.length,
    nVal: val.length,
    nTotal: samples.length,
    seed: SEED,
    scanSize: SIZE,
    featureNames: [...PHOTO_FEATURE_NAMES],
    classes: [...PHOTO_SCENE_CLASSES],
    scalerMean: mean.map((v) => Number(v.toFixed(6))),
    scalerScale: scale.map((v) => Number(v.toFixed(6))),
    hidden: HIDDEN,
    w1: mlp.w1.map((row) => row.map((v) => Number(v.toFixed(6)))),
    b1: mlp.b1.map((v) => Number(v.toFixed(6))),
    w2: mlp.w2.map((row) => row.map((v) => Number(v.toFixed(6)))),
    b2: mlp.b2.map((v) => Number(v.toFixed(6))),
  };

  const metrics = {
    version: 1,
    nTotal: samples.length,
    nTrain: train.length,
    nVal: val.length,
    trainAccuracy: Number(trainMetrics.accuracy.toFixed(4)),
    valAccuracy: Number(valMetrics.accuracy.toFixed(4)),
    valRecall: valMetrics.perClass,
    valConfusion: valMetrics.confusion,
    classes: [...PHOTO_SCENE_CLASSES],
    counts: PHOTO_TRAIN_COUNTS,
    notes:
      "Synthetic labelled scenes for photo credibility. Accept classes: flood, pothole. Dry roads must be rejected.",
  };

  const manifest = {
    version: 1,
    status: "ready",
    nImages: samples.length,
    imageSize: SIZE,
    seed: SEED,
    classes: PHOTO_TRAIN_COUNTS,
    acceptClasses: ["flood", "pothole"],
    rejectClasses: PHOTO_SCENE_CLASSES.filter((c) => c !== "flood" && c !== "pothole"),
    paths: {
      images: "images/",
      samples: "samples/",
      labels: "labels.csv",
      features: "features.csv",
      weights: path.relative(root, path.join(modelDir, "weights.json")).replaceAll("\\", "/"),
    },
  };

  await writeFile(path.join(modelDir, "weights.json"), JSON.stringify(weights));
  await writeFile(path.join(modelDir, "metrics.json"), JSON.stringify(metrics, null, 2));
  await writeFile(path.join(datasetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(
    path.join(datasetDir, "README.md"),
    [
      "# Photo scene training set",
      "",
      `Stored **${samples.length}** labelled images across ${PHOTO_SCENE_CLASSES.length} classes.`,
      "",
      "| Class | Count | Used as |",
      "|---|---:|---|",
      ...PHOTO_SCENE_CLASSES.map(
        (c) =>
          `| ${c} | ${PHOTO_TRAIN_COUNTS[c]} | ${c === "flood" || c === "pothole" ? "accept (incident)" : "reject"} |`,
      ),
      "",
      "## Files",
      "",
      "- `images/{class}/*.jpg` — full training photos (gitignored; regenerate with `pnpm train:photos`)",
      "- `samples/` — 8 examples per class, kept in git",
      "- `labels.csv` — id, label, split, path, accept",
      "- `features.csv` — the exact feature vectors used to train the model",
      "- `../../models/photo-scene/weights.json` — MLP weights loaded at report time",
      "",
      "A plain dry road is labelled `dry_road` and must not receive high credibility.",
      "",
    ].join("\n"),
  );

  console.log(`Stored dataset at ${path.relative(root, datasetDir)}`);
  console.log(`Stored model at ${path.relative(root, modelDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
