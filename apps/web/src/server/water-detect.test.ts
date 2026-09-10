import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { analyzePhotoCues } from "./water-detect";

async function solid(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 96, height: 96, channels: 3, background: { r, g, b } },
  })
    .jpeg()
    .toBuffer();
}

async function potholeLike(): Promise<Buffer> {
  const { data } = await sharp({
    create: { width: 96, height: 96, channels: 3, background: { r: 92, g: 92, b: 90 } },
  })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 38; y < 70; y++) {
    for (let x = 32; x < 64; x++) {
      const dx = (x - 48) / 16;
      const dy = (y - 54) / 14;
      if (dx * dx + dy * dy <= 1) {
        const i = (y * 96 + x) * 3;
        data[i] = 22;
        data[i + 1] = 22;
        data[i + 2] = 20;
      }
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

test("pothole-like gray road with a dark hole is accepted", async () => {
  const cues = await analyzePhotoCues(await potholeLike());
  assert.equal(cues.looksLikeFloodOrPothole, true);
});
