/**
 * Photo cues for flood / pothole reports.
 * Not a trained vision model — looks for road + hole or standing water,
 * and rejects clothing / skin / indoor objects (e.g. jeans).
 */
export type PhotoCueResult = {
  waterDetected: boolean;
  waterScore: number;
  damageScore: number;
  damageLevel: 1 | 2 | 3 | 4 | 5;
  reason: string;
  sceneScore: number;
  looksLikeFloodOrPothole: boolean;
  sceneReason: string;
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

function isSkin(r: number, g: number, b: number, sat: number, lum: number): boolean {
  return (
    r > 90 &&
    g > 40 &&
    b > 20 &&
    r > g &&
    r > b &&
    r - g >= 12 &&
    r - g <= 90 &&
    sat >= 0.12 &&
    sat <= 0.55 &&
    lum >= 55 &&
    lum <= 210
  );
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
    let asphalt = 0;
    let fabric = 0;
    let skin = 0;
    let sky = 0;
    let total = 0;
    let sumLum = 0;
    let sumLum2 = 0;

    const startRow = Math.floor(height * 0.18);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const r = raw[i] ?? 0;
        const g = raw[i + 1] ?? 0;
        const b = raw[i + 2] ?? 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (y < height * 0.22 && lum > 145 && sat < 0.28 && b >= r - 4) {
          sky += 1;
        }

        if (y < startRow) continue;
        total += 1;
        sumLum += lum;
        sumLum2 += lum * lum;

        const channelSpread = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
        if (sat < 0.16 && lum >= 28 && lum <= 165 && channelSpread < 22) {
          asphalt += 1;
        }

        // Standing water: cool and murky — not saturated fabric blue.
        if (b > r + 10 && b >= g - 6 && sat < 0.26 && lum > 32 && lum < 165) {
          cool += 1;
        }
        if (max < 100 && sat < 0.22 && channelSpread < 16) {
          wetGray += 1;
        }
        if (lum < 45 && sat < 0.25) darkCrater += 1;
        else if (lum < 85 && sat < 0.2) midBreak += 1;

        if (sat > 0.32 && lum > 35 && lum < 200) fabric += 1;
        if (isSkin(r, g, b, sat, lum)) skin += 1;
      }
    }

    const coolRatio = total ? cool / total : 0;
    const wetRatio = total ? wetGray / total : 0;
    const darkRatio = total ? darkCrater / total : 0;
    const breakRatio = total ? midBreak / total : 0;
    const asphaltRatio = total ? asphalt / total : 0;
    const fabricRatio = total ? fabric / total : 0;
    const skinRatio = total ? skin / total : 0;
    const skyRatio = height * width > 0 ? sky / (height * width) : 0;
    const meanLum = total ? sumLum / total : 128;
    const variance = total ? sumLum2 / total - meanLum * meanLum : 0;
    const contrast = Math.min(1, Math.sqrt(Math.max(0, variance)) / 70);

    const meanB = channels[2]?.mean ?? dominant.b;
    const meanR = channels[0]?.mean ?? dominant.r;
    const dominantSat = (() => {
      const max = Math.max(dominant.r, dominant.g, dominant.b);
      const min = Math.min(dominant.r, dominant.g, dominant.b);
      return max === 0 ? 0 : (max - min) / max;
    })();
    const dominantCool = meanB > meanR + 12 && dominantSat < 0.28;

    const waterScore = Number(
      Math.min(
        1,
        coolRatio * 1.05 + wetRatio * 1.15 + (dominantCool ? 0.08 : 0),
      ).toFixed(3),
    );
    const waterDetected = waterScore >= 0.28;

    const waterForDamage = coolRatio > 0.03 ? waterScore * 0.2 : 0;
    const damageScore = Number(
      Math.min(
        1,
        darkRatio * 1.6 + breakRatio * 0.9 + contrast * 0.12 + waterForDamage,
      ).toFixed(3),
    );
    const damageLevel = levelFromDamage(damageScore, waterScore);

    const roadOrWater = asphaltRatio + waterScore * 0.65;
    const sceneScore = Number(
      Math.max(
        0,
        Math.min(
          1,
          roadOrWater * 0.9 +
            darkRatio * 0.55 +
            skyRatio * 0.15 +
            contrast * 0.08 -
            fabricRatio * 1.35 -
            skinRatio * 1.1,
        ),
      ).toFixed(3),
    );

    const looksLikeFloodOrPothole =
      sceneScore >= 0.26 &&
      fabricRatio < 0.22 &&
      skinRatio < 0.24 &&
      (asphaltRatio >= 0.16 || waterScore >= 0.22 || (darkRatio >= 0.08 && asphaltRatio >= 0.1));

    const sceneReason = looksLikeFloodOrPothole
      ? `Looks like a flood or broken-road photo (road ${(asphaltRatio * 100).toFixed(0)}%, hole ${(darkRatio * 100).toFixed(0)}%, water ${(waterScore * 100).toFixed(0)}%).`
      : fabricRatio >= 0.22
        ? "Photo looks like clothing or a close object, not a flooded street or pothole."
        : skinRatio >= 0.24
          ? "Photo looks like a person, not a flooded street or pothole."
          : "Photo does not look like standing water or road damage.";

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
      sceneScore,
      looksLikeFloodOrPothole,
      sceneReason,
    };
  } catch {
    return {
      waterDetected: false,
      waterScore: 0,
      damageScore: 0,
      damageLevel: 1,
      reason: "Could not analyse image bytes",
      sceneScore: 0,
      looksLikeFloodOrPothole: false,
      sceneReason: "Could not read that photo.",
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
