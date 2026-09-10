/**
 * Procedural labelled photos for the scene classifier.
 * Kept separate so training can import the same generators used for smoke tests.
 */
import type { PhotoSceneClass } from "../src/server/photo-scene-model";

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min)) + min;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function setPx(
  buf: Uint8Array,
  w: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  if (x < 0 || y < 0 || x >= w) return;
  const h = buf.length / (w * 3);
  if (y >= h) return;
  const i = (y * w + x) * 3;
  buf[i] = clamp(r, 0, 255);
  buf[i + 1] = clamp(g, 0, 255);
  buf[i + 2] = clamp(b, 0, 255);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fillNoise(
  buf: Uint8Array,
  w: number,
  h: number,
  rng: Rng,
  r0: number,
  g0: number,
  b0: number,
  amp: number,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (rng() - 0.5) * amp;
      setPx(buf, w, x, y, r0 + n, g0 + n, b0 + n * 0.9);
    }
  }
}

function fillRect(
  buf: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  jitter: number,
  rng: Rng,
): void {
  const h = buf.length / (w * 3);
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
      const n = (rng() - 0.5) * jitter;
      setPx(buf, w, x, y, r + n, g + n, b + n);
    }
  }
}

function fillEllipse(
  buf: Uint8Array,
  w: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: number,
  g: number,
  b: number,
  jitter: number,
  rng: Rng,
): void {
  const h = buf.length / (w * 3);
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(h, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(w, Math.ceil(cx + rx));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const n = (rng() - 0.5) * jitter;
        setPx(buf, w, x, y, r + n, g + n, b + n);
      }
    }
  }
}

function drawRoadBase(buf: Uint8Array, w: number, h: number, rng: Rng, wet = false): void {
  const skyH = Math.floor(h * (0.12 + rng() * 0.2));
  const skyR = randInt(rng, 140, 190);
  const skyG = randInt(rng, 160, 205);
  const skyB = randInt(rng, 185, 230);
  for (let y = 0; y < skyH; y++) {
    const t = y / Math.max(1, skyH);
    for (let x = 0; x < w; x++) {
      const n = (rng() - 0.5) * 10;
      setPx(
        buf,
        w,
        x,
        y,
        mix(skyR, skyR - 25, t) + n,
        mix(skyG, skyG - 20, t) + n,
        mix(skyB, skyB - 15, t) + n,
      );
    }
  }
  const base = wet ? randInt(rng, 48, 78) : randInt(rng, 70, 115);
  const amp = wet ? 10 : 16;
  for (let y = skyH; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const grain = (rng() - 0.5) * amp;
      const shade = (y - skyH) / Math.max(1, h - skyH);
      const lum = base - shade * 8 + grain;
      const cool = wet ? 8 : 0;
      setPx(buf, w, x, y, lum, lum, lum + cool);
    }
  }
  if (rng() > 0.35) {
    const laneX = Math.floor(w * (0.42 + rng() * 0.16));
    const yellow = rng() > 0.4;
    for (let y = skyH + 4; y < h; y += randInt(rng, 5, 10)) {
      const len = randInt(rng, 4, 9);
      for (let yy = y; yy < Math.min(h, y + len); yy++) {
        for (let x = laneX; x < laneX + 2; x++) {
          if (yellow) setPx(buf, w, x, yy, 210, 180, 40);
          else setPx(buf, w, x, yy, 230, 230, 225);
        }
      }
    }
  }
  if (rng() > 0.55) {
    const side = rng() > 0.5 ? 0 : w - 10;
    fillRect(buf, w, side, skyH, side + 10, h, 150, 148, 140, 12, rng);
  }
}

export function generateScene(
  label: PhotoSceneClass,
  size: number,
  rng: Rng,
): Uint8Array {
  const buf = new Uint8Array(size * size * 3);
  const w = size;
  const h = size;

  if (label === "dry_road") {
    drawRoadBase(buf, w, h, rng, false);
    return buf;
  }

  if (label === "pothole") {
    drawRoadBase(buf, w, h, rng, false);
    const holes = randInt(rng, 1, 4);
    for (let n = 0; n < holes; n++) {
      const rx = randInt(rng, 7, 16);
      const ry = randInt(rng, 6, 14);
      const cx = randInt(rng, rx + 4, w - rx - 4);
      const cy = randInt(rng, Math.floor(h * 0.4) + ry, h - ry - 3);
      fillEllipse(buf, w, cx, cy, rx + 2, ry + 2, 130, 128, 118, 10, rng);
      fillEllipse(buf, w, cx, cy, rx, ry, randInt(rng, 8, 28), randInt(rng, 8, 26), randInt(rng, 6, 24), 6, rng);
    }
    return buf;
  }

  if (label === "flood") {
    drawRoadBase(buf, w, h, rng, true);
    const waterTop = Math.floor(h * (0.38 + rng() * 0.2));
    const wr = randInt(rng, 36, 62);
    const wg = wr + randInt(rng, 8, 16);
    const wb = wr + randInt(rng, 18, 30);
    for (let y = waterTop; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = (rng() - 0.5) * 14;
        const wave = Math.sin(x / (6 + rng() * 4) + y / 9) * 8;
        setPx(buf, w, x, y, wr + n + wave * 0.2, wg + n, wb + n + wave * 0.4);
      }
    }
    for (let k = 0; k < randInt(rng, 3, 8); k++) {
      const y = randInt(rng, waterTop + 2, h - 2);
      for (let x = randInt(rng, 0, 20); x < w; x++) {
        if (rng() > 0.15) setPx(buf, w, x, y, 190, 200, 210);
      }
    }
    return buf;
  }

  if (label === "indoor") {
    fillNoise(buf, w, h, rng, randInt(rng, 170, 210), randInt(rng, 150, 190), randInt(rng, 120, 160), 18);
    fillRect(buf, w, 0, Math.floor(h * 0.62), w, h, 120, 90, 55, 14, rng);
    fillRect(
      buf,
      w,
      randInt(rng, 8, 30),
      randInt(rng, 20, 40),
      randInt(rng, 50, 80),
      randInt(rng, 55, 75),
      randInt(rng, 80, 160),
      randInt(rng, 60, 120),
      randInt(rng, 40, 90),
      12,
      rng,
    );
    fillRect(buf, w, randInt(rng, 8, 40), randInt(rng, 6, 18), randInt(rng, 50, 90), randInt(rng, 28, 42), 230, 230, 210, 8, rng);
    return buf;
  }

  if (label === "clothing") {
    const denim = rng() > 0.45;
    if (denim) fillNoise(buf, w, h, rng, 28, 52, 118, 22);
    else {
      fillNoise(
        buf,
        w,
        h,
        rng,
        randInt(rng, 20, 200),
        randInt(rng, 20, 180),
        randInt(rng, 20, 180),
        28,
      );
    }
    if (rng() > 0.4) {
      fillEllipse(buf, w, w / 2, randInt(rng, 20, 40), 18, 22, 198, 142, 112, 10, rng);
    }
    return buf;
  }

  if (label === "nature") {
    fillNoise(buf, w, h, rng, 40, 110, 42, 30);
    fillRect(buf, w, 0, 0, w, Math.floor(h * 0.28), 150, 190, 220, 12, rng);
    fillEllipse(buf, w, randInt(rng, 20, 70), randInt(rng, 40, 80), 16, 12, 70, 45, 25, 10, rng);
    return buf;
  }

  if (label === "sky") {
    for (let y = 0; y < h; y++) {
      const t = y / h;
      for (let x = 0; x < w; x++) {
        setPx(buf, w, x, y, mix(90, 180, t), mix(140, 200, t), mix(210, 235, t));
      }
    }
    for (let c = 0; c < randInt(rng, 2, 5); c++) {
      fillEllipse(
        buf,
        w,
        randInt(rng, 10, 80),
        randInt(rng, 8, 50),
        randInt(rng, 10, 22),
        randInt(rng, 6, 12),
        235,
        235,
        240,
        8,
        rng,
      );
    }
    return buf;
  }

  fillNoise(buf, w, h, rng, randInt(rng, 180, 240), randInt(rng, 180, 240), randInt(rng, 180, 240), 16);
  for (let i = 0; i < randInt(rng, 2, 6); i++) {
    fillEllipse(
      buf,
      w,
      randInt(rng, 10, 80),
      randInt(rng, 10, 80),
      randInt(rng, 6, 18),
      randInt(rng, 6, 18),
      randInt(rng, 10, 250),
      randInt(rng, 10, 250),
      randInt(rng, 10, 250),
      14,
      rng,
    );
  }
  return buf;
}

export const PHOTO_TRAIN_COUNTS: Record<PhotoSceneClass, number> = {
  flood: 1700,
  pothole: 1700,
  dry_road: 2300,
  indoor: 1150,
  clothing: 1150,
  nature: 950,
  object: 850,
  sky: 700,
};
