/**
 * Pixel features for flood / pothole / reject classification.
 * Training and live inference must use this file only.
 */

export const PHOTO_SCAN_SIZE = 96;

export const PHOTO_FEATURE_NAMES = [
  "coolRatio",
  "wetRatio",
  "murkyRatio",
  "darkRatio",
  "breakRatio",
  "asphaltRatio",
  "fabricRatio",
  "skinRatio",
  "skyRatio",
  "meanLumN",
  "contrast",
  "meanSat",
  "blueCast",
  "dominantCool",
  "darkCompactness",
  "darkCentroidY",
  "edgeDensity",
  "lowerCoolRatio",
  "lowerDarkRatio",
  "lowerAsphaltRatio",
  "holePeak",
  "rimScore",
  "uniformity",
  "warmRatio",
  "greenRatio",
  "specularRatio",
  "satHighRatio",
  "horizStructure",
] as const;

export type PhotoFeatureName = (typeof PHOTO_FEATURE_NAMES)[number];

export type PhotoFeatures = Record<PhotoFeatureName, number> & {
  waterScore: number;
  damageScore: number;
};

export function isSkinTone(r: number, g: number, b: number, sat: number, lum: number): boolean {
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

function clip01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function featuresToVector(features: PhotoFeatures): number[] {
  return PHOTO_FEATURE_NAMES.map((name) => features[name]);
}

export function extractPhotoFeatures(
  raw: Uint8Array | Buffer,
  width: number,
  height: number,
): PhotoFeatures {
  const startRow = Math.floor(height * 0.18);
  const lowerRow = Math.floor(height * 0.45);
  const pixels = width * height;

  let cool = 0;
  let wetGray = 0;
  let murky = 0;
  let darkCrater = 0;
  let midBreak = 0;
  let asphalt = 0;
  let fabric = 0;
  let skin = 0;
  let sky = 0;
  let warm = 0;
  let greenish = 0;
  let specular = 0;
  let satHigh = 0;
  let ground = 0;
  let lower = 0;
  let lowerCool = 0;
  let lowerDark = 0;
  let lowerAsphalt = 0;
  let sumLum = 0;
  let sumLum2 = 0;
  let sumSat = 0;
  let sumBMinusR = 0;
  let darkSumX = 0;
  let darkSumY = 0;
  let darkSumX2 = 0;
  let darkSumY2 = 0;
  let darkCount = 0;
  let rimHits = 0;
  let rimChecked = 0;
  let edge = 0;
  let horiz = 0;
  let vert = 0;
  let edgeChecked = 0;

  const lumAt = (x: number, y: number): number => {
    const i = (y * width + x) * 3;
    const r = raw[i] ?? 0;
    const g = raw[i + 1] ?? 0;
    const b = raw[i + 2] ?? 0;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };

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
      const channelSpread = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

      if (y < height * 0.22 && lum > 145 && sat < 0.28 && b >= r - 4) {
        sky += 1;
      }

      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const gx = lumAt(x + 1, y) - lumAt(x - 1, y);
        const gy = lumAt(x, y + 1) - lumAt(x, y - 1);
        const mag = Math.abs(gx) + Math.abs(gy);
        edgeChecked += 1;
        if (mag > 28) {
          edge += 1;
          if (Math.abs(gy) > Math.abs(gx) + 8) horiz += 1;
          else if (Math.abs(gx) > Math.abs(gy) + 8) vert += 1;
        }
      }

      if (y < startRow) continue;
      ground += 1;
      sumLum += lum;
      sumLum2 += lum * lum;
      sumSat += sat;
      sumBMinusR += b - r;

        const isAsphalt = sat < 0.16 && lum >= 28 && lum <= 165 && channelSpread < 22;
      if (isAsphalt) asphalt += 1;

      const nearGray = channelSpread < 14 && Math.abs(g - r) < 10;
      const coolWater =
        b > r + 8 &&
        b >= g - 10 &&
        sat < 0.38 &&
        lum > 24 &&
        lum < 145 &&
        !nearGray;

      if (coolWater) cool += 1;
      if (max < 100 && sat < 0.22 && channelSpread < 16 && b > r + 6 && !nearGray) wetGray += 1;
      if (sat < 0.24 && lum >= 28 && lum <= 120 && b > r + 6 && !nearGray) murky += 1;
      if (lum < 45 && sat < 0.25) darkCrater += 1;
      else if (lum < 85 && sat < 0.2) midBreak += 1;
      if (sat > 0.32 && lum > 35 && lum < 200) fabric += 1;
      if (isSkinTone(r, g, b, sat, lum)) skin += 1;
      if (r > g + 8 && r > b + 8 && sat > 0.18) warm += 1;
      if (g > r + 8 && g > b && sat > 0.18 && lum > 40) greenish += 1;
      if (sat > 0.4) satHigh += 1;
      if (lum > 175 && sat < 0.22 && y >= lowerRow) specular += 1;

      if (y >= lowerRow) {
        lower += 1;
        if (coolWater) lowerCool += 1;
        if (lum < 45) lowerDark += 1;
        if (isAsphalt) lowerAsphalt += 1;
      }

      if (lum < 48 && sat < 0.3) {
        darkCount += 1;
        darkSumX += x;
        darkSumY += y;
        darkSumX2 += x * x;
        darkSumY2 += y * y;
        if (x >= 6 && x < width - 6 && y >= 6 && y < height - 6) {
          rimChecked += 1;
          const ring = (lumAt(x + 6, y) + lumAt(x - 6, y) + lumAt(x, y + 6) + lumAt(x, y - 6)) / 4;
          if (ring > lum + 22) rimHits += 1;
        }
      }
    }
  }

  const coolRatio = ground ? cool / ground : 0;
  const wetRatio = ground ? wetGray / ground : 0;
  const murkyRatio = ground ? murky / ground : 0;
  const darkRatio = ground ? darkCrater / ground : 0;
  const breakRatio = ground ? midBreak / ground : 0;
  const asphaltRatio = ground ? asphalt / ground : 0;
  const fabricRatio = ground ? fabric / ground : 0;
  const skinRatio = ground ? skin / ground : 0;
  const skyRatio = pixels ? sky / pixels : 0;
  const meanLum = ground ? sumLum / ground : 128;
  const variance = ground ? sumLum2 / ground - meanLum * meanLum : 0;
  const contrast = clip01(Math.sqrt(Math.max(0, variance)) / 70);
  const meanSat = ground ? sumSat / ground : 0;
  const meanBMinusR = ground ? sumBMinusR / ground : 0;
  const blueCast = clip01((meanBMinusR + 40) / 80);
  const dominantCool = meanBMinusR > 12 ? 1 : 0;
  const meanLumN = clip01(meanLum / 255);
  const darkCentroidY =
    darkCount > 0 ? clip01(darkSumY / darkCount / Math.max(1, height - 1)) : 0.5;
  let darkCompactness = 0;
  if (darkCount >= 8) {
    const mx = darkSumX / darkCount;
    const my = darkSumY / darkCount;
    const sd =
      Math.sqrt(Math.max(0, darkSumX2 / darkCount - mx * mx)) +
      Math.sqrt(Math.max(0, darkSumY2 / darkCount - my * my));
    darkCompactness = clip01(1 / (1 + sd / 18));
  }
  const edgeDensity = edgeChecked ? edge / edgeChecked : 0;
  const lowerCoolRatio = lower ? lowerCool / lower : 0;
  const lowerDarkRatio = lower ? lowerDark / lower : 0;
  const lowerAsphaltRatio = lower ? lowerAsphalt / lower : 0;
  const rimScore = rimChecked ? rimHits / rimChecked : 0;
  const uniformity = clip01(1 - contrast);
  const warmRatio = ground ? warm / ground : 0;
  const greenRatio = ground ? greenish / ground : 0;
  const specularRatio = ground ? specular / ground : 0;
  const satHighRatio = ground ? satHigh / ground : 0;
  const horizStructure = clip01(horiz / (horiz + vert + 1));

  const win = 12;
  const stride = 4;
  let holePeak = 0;
  if (width >= win && height >= win) {
    for (let y0 = startRow; y0 <= height - win; y0 += stride) {
      for (let x0 = 0; x0 <= width - win; x0 += stride) {
        let dark = 0;
        for (let y = y0; y < y0 + win; y++) {
          for (let x = x0; x < x0 + win; x++) {
            if (lumAt(x, y) < 48) dark += 1;
          }
        }
        holePeak = Math.max(holePeak, dark / (win * win));
      }
    }
  }

  const waterScore = Number(
    clip01(
      lowerCoolRatio * 1.35 +
        specularRatio * 0.7 +
        (lowerCoolRatio >= 0.12 ? 0.08 : 0),
    ).toFixed(4),
  );
  const waterForDamage = coolRatio > 0.03 ? waterScore * 0.2 : 0;
  const damageScore = Number(
    clip01(darkRatio * 1.6 + breakRatio * 0.9 + holePeak * 0.35 + contrast * 0.08 + waterForDamage).toFixed(
      4,
    ),
  );

  return {
    coolRatio: Number(coolRatio.toFixed(4)),
    wetRatio: Number(wetRatio.toFixed(4)),
    murkyRatio: Number(murkyRatio.toFixed(4)),
    darkRatio: Number(darkRatio.toFixed(4)),
    breakRatio: Number(breakRatio.toFixed(4)),
    asphaltRatio: Number(asphaltRatio.toFixed(4)),
    fabricRatio: Number(fabricRatio.toFixed(4)),
    skinRatio: Number(skinRatio.toFixed(4)),
    skyRatio: Number(skyRatio.toFixed(4)),
    meanLumN: Number(meanLumN.toFixed(4)),
    contrast: Number(contrast.toFixed(4)),
    meanSat: Number(meanSat.toFixed(4)),
    blueCast: Number(blueCast.toFixed(4)),
    dominantCool,
    darkCompactness: Number(darkCompactness.toFixed(4)),
    darkCentroidY: Number(darkCentroidY.toFixed(4)),
    edgeDensity: Number(edgeDensity.toFixed(4)),
    lowerCoolRatio: Number(lowerCoolRatio.toFixed(4)),
    lowerDarkRatio: Number(lowerDarkRatio.toFixed(4)),
    lowerAsphaltRatio: Number(lowerAsphaltRatio.toFixed(4)),
    holePeak: Number(holePeak.toFixed(4)),
    rimScore: Number(rimScore.toFixed(4)),
    uniformity: Number(uniformity.toFixed(4)),
    warmRatio: Number(warmRatio.toFixed(4)),
    greenRatio: Number(greenRatio.toFixed(4)),
    specularRatio: Number(specularRatio.toFixed(4)),
    satHighRatio: Number(satHighRatio.toFixed(4)),
    horizStructure: Number(horizStructure.toFixed(4)),
    waterScore,
    damageScore,
  };
}

export function hasStandingWater(features: PhotoFeatures): boolean {
  return features.lowerCoolRatio >= 0.1 || (features.waterScore >= 0.22 && features.lowerCoolRatio >= 0.06);
}

export function hasPotholeCue(features: PhotoFeatures): boolean {
  return (
    features.asphaltRatio >= 0.1 &&
    features.holePeak >= 0.28 &&
    features.rimScore >= 0.06 &&
    features.darkCompactness >= 0.18 &&
    features.fabricRatio < 0.25 &&
    features.skinRatio < 0.22
  );
}

export function looksLikeClothingOrPerson(features: PhotoFeatures): boolean {
  return (
    (features.fabricRatio >= 0.22 || features.skinRatio >= 0.24) &&
    features.asphaltRatio < 0.22 &&
    features.waterScore < 0.3
  );
}
