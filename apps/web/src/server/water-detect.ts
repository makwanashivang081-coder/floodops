/**
 * Lightweight image cues (not a trained vision model).
 * - Water: cool / murky wet pixels
 * - Damage: dark crater-like regions → hazard level 1–5
 * Calibrated against data/validation/pothole_levels labeled pack.
 */
export type PhotoCueResult = {
  waterDetected: boolean;
  waterScore: number;
  damageScore: number;
  damageLevel: 1 | 2 | 3 | 4 | 5;
  reason: string;
};

export type WaterDetectResult = {
  waterDetected: boolean;
  waterScore: number;
  reason: string;
};

function levelFromDamage(score: number, waterScore: number): 1 | 2 | 3 | 4 | 5 {
  let s = score;
  // Standing water in a crater escalates hazard.
  if (waterScore >= 0.4) s += 0.2;
  if (s >= 0.72) return 5;
  if (s >= 0.395) return 4;
  if (s >= 0.175) return 3;
  if (s >= 0.088) return 2;
  return 1;
}

export async function analyzePhotoCues(buffer: Buffer): Promise<PhotoCueResult> {
  try {
    const sharp = (await import("sharp")).default;
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

        // Stricter cool (true blue/cyan water), not just coolish asphalt.
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
      Math.min(
        1,
        coolRatio * 1.0 + wetRatio * 1.3 + (dominantCool ? 0.1 : 0),
      ).toFixed(3),
    );
    const waterDetected = waterScore >= 0.28;

    // Only let water boost damage when there is real cool water signal,
    // so dark dry asphalt does not look like a flood crater.
    const waterForDamage = coolRatio > 0.03 ? waterScore * 0.2 : 0;
    const damageScore = Number(
      Math.min(
        1,
        darkRatio * 1.6 + breakRatio * 0.9 + contrast * 0.12 + waterForDamage,
      ).toFixed(3),
    );
    const damageLevel = levelFromDamage(damageScore, waterScore);

    const reason = [
      waterDetected
        ? `wet/cool cue ${(waterScore * 100).toFixed(0)}%`
        : `dry cue ${(waterScore * 100).toFixed(0)}%`,
      `damage L${damageLevel} (${(damageScore * 100).toFixed(0)}%)`,
      `dark ${(darkRatio * 100).toFixed(0)}%`,
    ].join(" · ");

    return {
      waterDetected,
      waterScore,
      damageScore,
      damageLevel,
      reason,
    };
  } catch {
    return {
      waterDetected: false,
      waterScore: 0,
      damageScore: 0,
      damageLevel: 1,
      reason: "Could not analyse image bytes",
    };
  }
}

/** @deprecated prefer analyzePhotoCues — kept for existing call sites */
export async function detectWaterInPhoto(
  buffer: Buffer,
): Promise<WaterDetectResult> {
  const full = await analyzePhotoCues(buffer);
  return {
    waterDetected: full.waterDetected,
    waterScore: full.waterScore,
    reason: full.reason,
  };
}
