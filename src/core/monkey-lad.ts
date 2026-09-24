/**
 * CC0 Monkey Lad sprite frames from OpenGameArt, recolored for GorillaPunch.
 * The source atlas is cropped at runtime so both the site and desktop app use
 * the same hand-picked stand, run, and jump poses without shipping unrelated art.
 */
export const MONKEY_FRAME_WIDTH = 16;
export const MONKEY_FRAME_HEIGHT = 24;
// The source row starts with two turn-in poses and ends with two back-facing
// poses. Keep the four consistent side-on run frames for a clean loop.
export const MONKEY_RUN_FRAME_COUNT = 4;
export const MONKEY_STAND_FRAME = MONKEY_RUN_FRAME_COUNT;
export const MONKEY_STAND_FRAME_COUNT = 2;
export const MONKEY_JUMP_FRAME = MONKEY_STAND_FRAME + MONKEY_STAND_FRAME_COUNT;
export const MONKEY_SCALE = 0.95;
export const MONKEY_HITBOX = { left: 2, top: 2, width: 12, height: 20 } as const;
export const MONKEY_RUN_STEP = 34;
export const MONKEY_STAND_STEP_MS = 520;

const RUN_ATLAS_X = 480;
const JUMP_ATLAS_X = 448;
const WALK_Y = 208;
const JUMP_Y = 232;
const STAND_ATLAS_X = 448;
const STAND_Y = 208;

const BRAND_PALETTE = new Map<number, readonly [number, number, number]>([
  [0x000000, [23, 19, 31]],       // outline
  [0xffaa00, [189, 172, 236]],    // warm fur -> soft lavender
  [0xaa5500, [112, 82, 174]],     // fur shade -> muted violet
  [0xff5500, [117, 83, 255]],     // shirt -> GorillaPunch violet
  [0xaa0000, [58, 42, 94]],       // shirt shade -> deep violet
  [0x0055aa, [83, 66, 135]],      // trousers -> plum
  [0x00aaff, [149, 124, 223]],    // highlights -> arcade lavender
  [0xffffff, [246, 242, 255]],    // face details
]);

/** Build a compact idle cycle, 4-frame run cycle, and jump pose from the atlas. */
export function createMonkeyRunnerSheet(source: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = MONKEY_FRAME_WIDTH * (MONKEY_RUN_FRAME_COUNT + MONKEY_STAND_FRAME_COUNT + 1);
  canvas.height = MONKEY_FRAME_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not prepare the Monkey Lad sprite.");

  ctx.imageSmoothingEnabled = false;
  for (let frame = 0; frame < MONKEY_RUN_FRAME_COUNT; frame++) {
    ctx.drawImage(
      source,
      RUN_ATLAS_X + frame * MONKEY_FRAME_WIDTH,
      WALK_Y,
      MONKEY_FRAME_WIDTH,
      MONKEY_FRAME_HEIGHT,
      frame * MONKEY_FRAME_WIDTH,
      0,
      MONKEY_FRAME_WIDTH,
      MONKEY_FRAME_HEIGHT,
    );
  }
  for (let frame = 0; frame < MONKEY_STAND_FRAME_COUNT; frame++) {
    ctx.drawImage(
      source,
      STAND_ATLAS_X + frame * MONKEY_FRAME_WIDTH,
      STAND_Y,
      MONKEY_FRAME_WIDTH,
      MONKEY_FRAME_HEIGHT,
      (MONKEY_STAND_FRAME + frame) * MONKEY_FRAME_WIDTH,
      0,
      MONKEY_FRAME_WIDTH,
      MONKEY_FRAME_HEIGHT,
    );
  }
  ctx.drawImage(
    source,
    JUMP_ATLAS_X,
    JUMP_Y,
    MONKEY_FRAME_WIDTH,
    MONKEY_FRAME_HEIGHT,
    MONKEY_JUMP_FRAME * MONKEY_FRAME_WIDTH,
    0,
    MONKEY_FRAME_WIDTH,
    MONKEY_FRAME_HEIGHT,
  );

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] === 0) continue;
    const key = (pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2];
    const color = BRAND_PALETTE.get(key);
    if (color) {
      pixels.data[i] = color[0];
      pixels.data[i + 1] = color[1];
      pixels.data[i + 2] = color[2];
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
