/**
 * Build the hero artwork with a feathered edge.
 *
 * The source illustration is a cut-out with a hard, pale-mint silhouette
 * (#E9FCF2). Dropped on a page that edge reads as a pasted rectangle. We blur
 * the alpha channel and write it back, so the artwork fades out over ~18px and
 * dissolves into whatever green the hero sits on.
 *
 *   node scripts/soften-hero.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "public/brand/hero-illustration.png";
const OUT_PNG = "public/brand/hero-illustration-soft.png";
const OUT_WEBP = "public/brand/hero-illustration-soft.webp";
const SIGMA = 7;

const img = sharp(SRC);
const { width, height } = await img.metadata();

/** Blurred alpha = the feather mask (raw, so joinChannel can take it). */
const alpha = await sharp(SRC)
  .ensureAlpha()
  .extractChannel("alpha")
  .blur(SIGMA)
  .raw()
  .toBuffer();

/** Keep the original RGB, swap in the feathered alpha. */
const rgb = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });

const feathered = await sharp(rgb.data, {
  raw: { width: rgb.info.width, height: rgb.info.height, channels: 3 },
})
  .joinChannel(alpha, { raw: { width, height, channels: 1 } })
  .png({ compressionLevel: 9 })
  .toBuffer();

mkdirSync("public/brand", { recursive: true });
await sharp(feathered).png({ compressionLevel: 9 }).toFile(OUT_PNG);
await sharp(feathered).webp({ quality: 88 }).toFile(OUT_WEBP);

const meta = await sharp(OUT_PNG).metadata();
console.log(
  `softened hero written: ${OUT_PNG} (${width}x${height}, ${meta.channels} channels)`,
);
