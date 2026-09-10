import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { generateScene, mulberry32 } from "../../scripts/photo-scene-generate";
import { analyzePhotoCues } from "./water-detect";

async function solid(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 96, height: 96, channels: 3, background: { r, g, b } },
  })
    .jpeg()
    .toBuffer();
}

async function fromRaw(raw: Uint8Array): Promise<Buffer> {
  return sharp(Buffer.from(raw), { raw: { width: 96, height: 96, channels: 3 } })
    .jpeg()
    .toBuffer();
}

async function potholeLike(): Promise<Buffer> {
  const { data } = await sharp({
    create: { width: 96, height: 96, channels: 3, background: { r: 92, g: 92, b: 90 } },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 36; y < 72; y++) {
    for (let x = 30; x < 66; x++) {
      const dx = (x - 48) / 16;
      const dy = (y - 54) / 14;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 1.35 && d2 >= 0.78) {
        const i = (y * 96 + x) * 3;
        data[i] = 150;
        data[i + 1] = 146;
        data[i + 2] = 132;
      } else if (d2 <= 0.78) {
        const i = (y * 96 + x) * 3;
        data[i] = 18;
        data[i + 1] = 18;
        data[i + 2] = 16;
      }
    }
  }
  return sharp(data, { raw: { width: 96, height: 96, channels: 3 } })
    .jpeg()
    .toBuffer();
}

async function dryRoad(): Promise<Buffer> {
  const { data } = await sharp({
    create: { width: 96, height: 96, channels: 3, background: { r: 96, g: 96, b: 94 } },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 3;
      data[i] = 168;
      data[i + 1] = 186;
      data[i + 2] = 210;
    }
  }
  for (let y = 28; y < 96; y += 8) {
    for (let yy = y; yy < Math.min(96, y + 5); yy++) {
      for (let x = 46; x < 49; x++) {
        const i = (yy * 96 + x) * 3;
        data[i] = 214;
        data[i + 1] = 186;
        data[i + 2] = 42;
      }
    }
  }
  return sharp(data, { raw: { width: 96, height: 96, channels: 3 } })
    .jpeg()
    .toBuffer();
}

async function floodLike(): Promise<Buffer> {
  const { data } = await sharp({
    create: { width: 96, height: 96, channels: 3, background: { r: 88, g: 88, b: 86 } },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 3;
      data[i] = 160;
      data[i + 1] = 180;
      data[i + 2] = 210;
    }
  }
  for (let y = 44; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 3;
        data[i] = 52;
        data[i + 1] = 64;
        data[i + 2] = 78;
    }
  }
  return sharp(data, { raw: { width: 96, height: 96, channels: 3 } })
    .jpeg()
    .toBuffer();
}

test("jeans-like blue fabric is rejected", async () => {
  const cues = await analyzePhotoCues(await solid(28, 52, 118));
  assert.equal(cues.looksLikeFloodOrPothole, false);
});

test("trained scene model is loaded", async () => {
  const cues = await analyzePhotoCues(await dryRoad());
  assert.equal(cues.modelUsed, true);
  assert.equal(cues.looksLikeFloodOrPothole, false);
});

test("generated dry-road scenes are rejected", async () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 6; i++) {
    const cues = await analyzePhotoCues(await fromRaw(generateScene("dry_road", 96, rng)));
    assert.equal(cues.looksLikeFloodOrPothole, false, `dry_road sample ${i}`);
  }
});

test("pothole-like gray road with a dark hole is accepted", async () => {
  const cues = await analyzePhotoCues(await potholeLike());
  assert.equal(cues.looksLikeFloodOrPothole, true);
});

test("standing-water flood photo is accepted", async () => {
  const cues = await analyzePhotoCues(await floodLike());
  assert.equal(cues.looksLikeFloodOrPothole, true);
  assert.equal(cues.waterDetected, true);
});

test("generated flood scenes are accepted", async () => {
  const rng = mulberry32(11);
  let accepted = 0;
  for (let i = 0; i < 8; i++) {
    const cues = await analyzePhotoCues(await fromRaw(generateScene("flood", 96, rng)));
    if (cues.looksLikeFloodOrPothole) accepted += 1;
  }
  assert.ok(accepted >= 7, `expected most flood scenes to be accepted, got ${accepted}/8`);
});

test("generated pothole scenes are accepted", async () => {
  const rng = mulberry32(13);
  let accepted = 0;
  for (let i = 0; i < 8; i++) {
    const cues = await analyzePhotoCues(await fromRaw(generateScene("pothole", 96, rng)));
    if (cues.looksLikeFloodOrPothole) accepted += 1;
  }
  assert.ok(accepted >= 6, `expected most pothole scenes to be accepted, got ${accepted}/8`);
});
