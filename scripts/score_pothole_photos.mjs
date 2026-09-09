/**
 * Local PC check: score pothole_levels photos (mirrors apps/web water-detect cues).
 * Run from repo root: node scripts/score_pothole_photos.mjs
 */
import { promises as fs } from "node:fs";
import path from "path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(path.join(root, "apps", "web", "package.json"));
const sharp = require("sharp");

function levelFromDamage(score, waterScore) {
  let s = score;
  if (waterScore >= 0.4) s += 0.2;
  if (s >= 0.72) return 5;
  if (s >= 0.395) return 4;
  if (s >= 0.175) return 3;
  if (s >= 0.088) return 2;
  return 1;
}

async function analyzePhotoCues(buffer) {
  const image = sharp(buffer).rotate();
  const { dominant, channels } = await image.stats();
  const meta = await image.metadata();
  const width = Math.min(96, meta.width ?? 96);
  const height = Math.min(96, meta.height ?? 96);
  const raw = await image
    .resize(width, height, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();

  let cool = 0;
  let wetGray = 0;
  let darkCrater = 0;
  let midBreak = 0;
  let total = 0;
  let sumLum = 0;
  let sumLum2 = 0;
  const startRow = Math.floor(height * 0.25);

  for (let y = startRow; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = raw[i] ?? 0;
      const g = raw[i + 1] ?? 0;
      const b = raw[i + 2] ?? 0;
      total += 1;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLum += lum;
      sumLum2 += lum * lum;
      if (b > r + 18 && b >= g - 4) cool += 1;
      if (max < 100 && sat < 0.22 && Math.abs(r - g) < 14 && Math.abs(g - b) < 16) {
        wetGray += 1;
      }
      if (lum < 45) darkCrater += 1;
      else if (lum < 85 && sat < 0.2) midBreak += 1;
    }
  }

  const coolRatio = total ? cool / total : 0;
  const wetRatio = total ? wetGray / total : 0;
  const darkRatio = total ? darkCrater / total : 0;
  const breakRatio = total ? midBreak / total : 0;
  const meanLum = total ? sumLum / total : 128;
  const variance = total ? sumLum2 / total - meanLum * meanLum : 0;
  const contrast = Math.min(1, Math.sqrt(Math.max(0, variance)) / 70);
  const meanB = channels[2]?.mean ?? dominant.b;
  const meanR = channels[0]?.mean ?? dominant.r;
  const dominantCool = meanB > meanR + 12;

  const waterScore = Number(
    Math.min(1, coolRatio * 1.0 + wetRatio * 1.3 + (dominantCool ? 0.1 : 0)).toFixed(3),
  );
  const waterDetected = waterScore >= 0.28;
  const waterForDamage = coolRatio > 0.03 ? waterScore * 0.2 : 0;
  const damageScore = Number(
    Math.min(1, darkRatio * 1.6 + breakRatio * 0.9 + contrast * 0.12 + waterForDamage).toFixed(3),
  );
  const damageLevel = levelFromDamage(damageScore, waterScore);
  return { waterDetected, waterScore, damageScore, damageLevel };
}

const folder = path.join(root, "data", "validation", "pothole_levels");
const files = (await fs.readdir(folder)).filter((f) => f.endsWith(".jpg")).sort();

console.log(`Folder: ${folder}`);
console.log(`Photos: ${files.length}\n`);
console.log(
  ["file".padEnd(36), "expect".padStart(6), "got".padStart(4), "dmg".padStart(6), "water".padStart(6), "wet".padStart(4), "ok".padStart(4), "risk"].join(" "),
);
console.log("-".repeat(90));

let hits = 0;
const rows = [];
for (const file of files) {
  const expected = Number(/level(\d)/i.exec(file)?.[1] ?? 0);
  const cue = await analyzePhotoCues(await fs.readFile(path.join(folder, file)));
  const ok = cue.damageLevel === expected;
  if (ok) hits += 1;
  const riskBand =
    cue.damageLevel >= 5
      ? "critical"
      : cue.damageLevel >= 4
        ? "severe"
        : cue.damageLevel >= 3
          ? "moderate"
          : cue.damageLevel >= 2
            ? "low"
            : "minor";
  rows.push({ file, expected, ...cue, match: ok, riskBand });
  console.log(
    [
      file.padEnd(36),
      String(expected).padStart(6),
      String(cue.damageLevel).padStart(4),
      cue.damageScore.toFixed(2).padStart(6),
      cue.waterScore.toFixed(2).padStart(6),
      (cue.waterDetected ? "yes" : "no").padStart(4),
      (ok ? "YES" : "no").padStart(4),
      riskBand,
    ].join(" "),
  );
}

const levels = [...new Set(rows.map((r) => r.damageLevel))].sort((a, b) => a - b);
console.log(`\nExact match: ${hits}/${files.length}`);
console.log(`Distinct damage levels: ${levels.join(", ")}`);
console.log(`Distinct risk bands: ${[...new Set(rows.map((r) => r.riskBand))].join(", ")}`);

const out = path.join(folder, "local_score_results.json");
await fs.writeFile(out, JSON.stringify({ scoredAt: new Date().toISOString(), rows }, null, 2));
console.log(`\nWrote ${out}`);
