import * as React from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import monkeyLadAssetUrl from "../assets/monkey-lad.png";
import {
  createMonkeyRunnerSheet,
  MONKEY_FRAME_HEIGHT,
  MONKEY_FRAME_WIDTH,
  MONKEY_HITBOX,
  MONKEY_JUMP_FRAME,
  MONKEY_RUN_FRAME_COUNT,
  MONKEY_RUN_STEP,
  MONKEY_SCALE,
} from "../../../src/core/monkey-lad";

const REF_W = 1440;
const REF_H = 512;

const ART = 4.8;
const GROUND_RATIO = 393 / REF_H;
const NEAR_DASH_RATIO = 422.5 / REF_H;
const FAR_DASH_RATIO = 448 / REF_H;
const HORIZON_THICK = 4.5;
const DASH_THICK = 5;
const DASH_PERIOD = 128;
const NEAR_DASH_ON = 45;
const FAR_DASH_ON = 23;
const A_HORIZON = 1.0;
const A_NEAR = 0.35;
const A_FAR = 0.25;
const A_SPRITE = 1.0;
const A_CLOUD = 0.4;

const BLOCK_UNITS = 11;
const IDLE_RESUME = 4;
const A_HUD_LABEL = 1.0;
const A_HUD_VALUE = 1.0;

type RGBA = [number, number, number, number];

const INK_FALLBACK: RGBA = [149, 124, 223, 1];
const BG_FALLBACK: RGBA = [36, 32, 43, 1];

const COLOR_CACHE = new Map<string, RGBA>();

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function parseColorRaw(raw: string, fallback: RGBA): RGBA {
  let s = raw.trim();
  const varMatch = s.match(/^var\(\s*--[^,]+,\s*([\s\S]+)\)\s*$/i);
  if (varMatch) s = varMatch[1].trim();

  if (s.charAt(0) === "#") {
    let h = s.slice(1).trim();
    if (h.length === 3 || h.length === 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (h.length !== 6 && h.length !== 8) return fallback;
    const ch = (i: number) => parseInt(h.slice(i, i + 2), 16);
    const r = ch(0);
    const g = ch(2);
    const b = ch(4);

    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      return fallback;
    }
    const a = h.length === 8 ? ch(6) / 255 : 1;
    return [r, g, b, clamp01(Number.isFinite(a) ? a : 1)];
  }

  const fn = s.match(/^(rgba?|hsla?)\(([^)]*)\)$/i);
  if (fn) {
    const name = fn[1].toLowerCase();
    const parts = fn[2].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 3) return fallback;
    const num = (t: string) => parseFloat(t);
    const alphaTok = parts[3];
    const alpha =
      alphaTok === undefined
        ? 1
        : alphaTok.endsWith("%")
          ? num(alphaTok) / 100
          : num(alphaTok);
    if (!Number.isFinite(alpha)) return fallback;

    if (name.charAt(0) === "r") {
      const chan = (t: string) =>
        t.endsWith("%") ? Math.round((num(t) * 255) / 100) : Math.round(num(t));
      const r = chan(parts[0]);
      const g = chan(parts[1]);
      const b = chan(parts[2]);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        return fallback;
      }
      return [r, g, b, clamp01(alpha)];
    }

    const hue = num(parts[0]);
    const sat = num(parts[1]) / 100;
    const lig = num(parts[2]) / 100;
    if (!Number.isFinite(hue) || !Number.isFinite(sat) || !Number.isFinite(lig)) {
      return fallback;
    }
    const [r, g, b] = hslToRgb(hue, clamp01(sat), clamp01(lig));
    return [r, g, b, clamp01(alpha)];
  }

  return fallback;
}

function parseColor(input: string | undefined, fallback: RGBA): RGBA {
  if (!input) return fallback;
  const hit = COLOR_CACHE.get(input);
  if (hit) return hit;
  const out = parseColorRaw(input, fallback);
  COLOR_CACHE.set(input, out);
  return out;
}

const CLOUD = [
  "....#####.......",
  "..########..##..",
  "################",
  ".##############.",
];

const BLOCK = [
  "..############..",
  ".##############.",
  "################",
  "################",
  "################",
  "################",
  "################",
  "################",
  "################",
  "################",
  "################",
  "################",
  "################",
  "################",
  ".##############.",
  "..############..",
];

// Launch blocker and 404 obstacle glyphs
const GLYPHS = [
  [
    ".#....#.",
    ".#....#.",
    ".#....#.",
    ".######.",
    "......#.",
    "......#.",
    "........",
    "........",
  ],
  [
    "..####..",
    ".#....#.",
    ".#..#.#.",
    ".#. #.#.",
    ".#....#.",
    "..####..",
    "........",
    "........",
  ],
  [
    "...##...",
    "...##...",
    "...##...",
    "...##...",
    "........",
    "...##...",
    "........",
    "........",
  ],
  [
    ".#....#.",
    "..#..#..",
    "...##...",
    "...##...",
    "..#..#..",
    ".#....#.",
    "........",
    "........",
  ],
];

const FONT: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", "..#", "..#", "..#"],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  S: ["###", "#..", "###", "..#", "###"],
  C: ["###", "#..", "#..", "#..", "###"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  R: ["###", "#.#", "###", "#.#", "#.#"],
  E: ["###", "#..", "###", "#..", "###"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  " ": ["...", "...", "...", "...", "..."],
};

type Obstacle = { x: number; stack: number; glyph: number };
type Cloud = { x: number; y: number; scale: number; depth: number };

type World = {
  t: number;
  dist: number;
  speed: number;
  playerY: number;
  playerV: number;
  grounded: boolean;
  obstacles: Obstacle[];
  clouds: Cloud[];
  dead: boolean;
  deadAt: number;
  score: number;
  best: number;
  nextGap: number;
  seed: number;
  played: boolean;
};

function rng(w: World) {
  w.seed = (w.seed * 1664525 + 1013904223) >>> 0;
  return w.seed / 4294967296;
}

const STORAGE_KEY = "gorillapunch_runner_best";

export interface PixelGameProps {
  background?: string;
  ink?: string;
  startSpeed?: number;
  maxSpeed?: number;
  gravity?: number;
  jump?: number;
  showHud?: boolean;
  attract?: boolean;
  farDashSpeed?: number;
  style?: React.CSSProperties;
  className?: string;
  onScoreSave?: (score: number, best: number) => void;
  initialBest?: number;
  paused?: boolean;
  onPauseToggle?: () => void;
}

export function PixelGame(props: PixelGameProps) {
  const {
    background = "#24202b",
    ink = "#957cdf",
    startSpeed = 420,
    maxSpeed = 980,
    gravity = 4780,
    jump = 1480,
    showHud = true,
    attract = true,
    farDashSpeed = 100,
    style,
    className,
    initialBest = 0,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const monkeyFramesRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const idleRef = useRef<number>(1e9);
  const hoverRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  function fresh(best: number, played: boolean): World {
    return {
      t: 0,
      dist: 0,
      speed: propsRef.current.startSpeed ?? startSpeed,
      playerY: 0,
      playerV: 0,
      grounded: true,
      obstacles: [],
      clouds: [],
      dead: false,
      deadAt: 0,
      score: 0,
      best,
      nextGap: 180,
      seed: 20260818,
      played,
    };
  }

  if (worldRef.current === null) {
    worldRef.current = fresh(initialBest, false);
  }

  useEffect(() => {
    // 1. Load initial local cache
    let localBest = 0;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) localBest = parseInt(stored, 10) || 0;
    } catch {}

    if (localBest > 0 && worldRef.current) {
      worldRef.current.best = Math.max(worldRef.current.best, localBest);
    }

    // 2. Load authoritative score from local SQLite database via IPC
    if (window.gorillaPunch?.game?.getHighScore) {
      void window.gorillaPunch.game.getHighScore().then(dbBest => {
        if (dbBest > 0 && worldRef.current) {
          const higher = Math.max(worldRef.current.best, dbBest);
          worldRef.current.best = higher;
          try { localStorage.setItem(STORAGE_KEY, String(higher)); } catch {}
        }
      });
    }
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      try {
        monkeyFramesRef.current = createMonkeyRunnerSheet(image);
      } catch {
        monkeyFramesRef.current = null;
      }
    };
    image.src = monkeyLadAssetUrl;
    return () => { image.onload = null; };
  }, []);

  const inkAt = (a: number) => {
    const [r, g, b, ia] = parseColor(propsRef.current.ink ?? ink, INK_FALLBACK);
    return `rgba(${r},${g},${b},${a * ia})`;
  };

  const bgFill = () => {
    const [r, g, b, a] = parseColor(propsRef.current.background ?? background, BG_FALLBACK);
    return `rgba(${r},${g},${b},${a})`;
  };

  function paint(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const world = worldRef.current!;
    const p = propsRef.current;
    const S = Math.max(0.3, Math.min(w / REF_W, h / REF_H, 3));
    const px = ART * S;
    const groundY = h * GROUND_RATIO;
    const playerX = w * 0.08;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgFill();
    ctx.fillRect(0, 0, w, h);

    const stamp = (rows: string[], ox: number, oy: number, unit: number, pixel = "#") => {
      for (let r = 0; r < rows.length; r++) {
        const y0 = Math.round(oy + r * unit);
        const y1 = Math.round(oy + (r + 1) * unit);
        let c = 0;
        while (c < rows[r].length) {
          if (rows[r][c] !== pixel) {
            c++;
            continue;
          }
          let e = c;
          while (e < rows[r].length && rows[r][e] === pixel) e++;
          const x0 = Math.round(ox + c * unit);
          const x1 = Math.round(ox + e * unit);
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          c = e;
        }
      }
    };

    const blit = (
      rows: string[],
      ox: number,
      oy: number,
      unit: number,
      alpha: number,
      knock?: string[]
    ) => {
      ctx.fillStyle = inkAt(alpha);
      stamp(rows, ox, oy, unit);
      if (knock) {
        const prev = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        const kx = ox + ((rows[0].length - knock[0].length) / 2) * unit;
        const ky = oy + ((rows.length - knock.length) / 2) * unit;
        stamp(knock, kx, ky, unit);
        ctx.globalCompositeOperation = prev;
      }
    };

    for (const cl of world.clouds) {
      blit(CLOUD, cl.x, cl.y * h, px * cl.scale, A_CLOUD * (0.7 + 0.3 * cl.depth));
    }

    ctx.fillStyle = inkAt(A_HORIZON);
    ctx.fillRect(0, Math.round(groundY), w, Math.max(1, Math.round(HORIZON_THICK * S)));

    const dashRow = (ratio: number, on: number, alpha: number, phase: number) => {
      const period = DASH_PERIOD * S;
      const len = on * S;
      const y = Math.round(h * ratio);
      const th = Math.max(1, Math.round(DASH_THICK * S));
      ctx.fillStyle = inkAt(alpha);
      const start = -((phase % period) + period) % period;
      for (let x = start; x < w; x += period) {
        ctx.fillRect(Math.round(x), y, Math.round(len), th);
      }
    };
    dashRow(NEAR_DASH_RATIO, NEAR_DASH_ON, A_NEAR, world.dist);

    const farMul = (p.farDashSpeed ?? farDashSpeed) / 100;
    dashRow(FAR_DASH_RATIO, FAR_DASH_ON, A_FAR, world.dist * farMul);

    for (const ob of world.obstacles) {
      const bu = BLOCK_UNITS * px;
      for (let i = 0; i < ob.stack; i++) {
        blit(
          BLOCK,
          ob.x,
          groundY - (i + 1) * bu,
          bu / 16,
          A_SPRITE,
          GLYPHS[(ob.glyph + i) % GLYPHS.length]
        );
      }
    }

    const monkeyUnit = px * MONKEY_SCALE;
    const feet = groundY - world.playerY;
    const monkeyFrames = monkeyFramesRef.current;
    if (monkeyFrames) {
      const frame = world.grounded
        ? Math.floor(world.dist / (MONKEY_RUN_STEP * S)) % MONKEY_RUN_FRAME_COUNT
        : MONKEY_JUMP_FRAME;
      const smoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        monkeyFrames,
        frame * MONKEY_FRAME_WIDTH,
        0,
        MONKEY_FRAME_WIDTH,
        MONKEY_FRAME_HEIGHT,
        playerX,
        feet - MONKEY_FRAME_HEIGHT * monkeyUnit,
        MONKEY_FRAME_WIDTH * monkeyUnit,
        MONKEY_FRAME_HEIGHT * monkeyUnit,
      );
      ctx.imageSmoothingEnabled = smoothing;
    }

    if (!(p.showHud ?? showHud)) return;

    const fpx = 4.2 * S;
    const text = (s: string, rightX: number, y: number, alpha: number) => {
      const cw = 4 * fpx;
      const total = s.length * cw - fpx;
      let x = rightX - total;
      ctx.fillStyle = inkAt(alpha);
      for (const ch of s) {
        const g = FONT[ch] ?? FONT[" "];
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 3; c++) {
            if (g[r][c] === "#") {
              ctx.fillRect(
                Math.round(x + c * fpx),
                Math.round(y + r * fpx),
                Math.round(x + (c + 1) * fpx) - Math.round(x + c * fpx),
                Math.round(y + (r + 1) * fpx) - Math.round(y + r * fpx)
              );
            }
          }
        }
        x += cw;
      }
    };
    const pad = (n: number) => String(Math.floor(n)).padStart(5, "0").slice(-5);
    const rightBest = w - 77 * S;
    const rightScore = rightBest - 190 * S;
    const labelY = h * 0.07;
    const valueY = h * 0.133;
    text("SCORE", rightScore, labelY, A_HUD_LABEL);
    text(pad(world.score), rightScore, valueY, A_HUD_VALUE);
    text("BEST", rightBest, labelY, A_HUD_LABEL);
    text(pad(world.best), rightBest, valueY, A_HUD_VALUE);
  }

  function jumpWindow(stack: number, sp: number, S: number) {
    const p = propsRef.current;
    const px = ART * S;
    const v = (p.jump ?? jump) * S;
    const g = (p.gravity ?? gravity) * S;
    const top = stack * BLOCK_UNITS * px;
    const disc = v * v - 2 * g * top;

    const tX = (MONKEY_HITBOX.width * MONKEY_SCALE * px + BLOCK_UNITS * px * 0.76) / sp;
    if (disc <= 0) return { ok: false, lead: 0 };
    const root = Math.sqrt(disc);
    const t1 = (v - root) / g;
    const t2 = (v + root) / g;

    return { ok: t2 - t1 > tX * 1.25, lead: t1 + (t2 - t1 - tX) / 2 };
  }

  function recordScore(score: number, best: number) {
    const roundedScore = Math.floor(score);
    const roundedBest = Math.floor(best);

    // 1. LocalStorage
    try {
      localStorage.setItem(STORAGE_KEY, String(roundedBest));
    } catch {}

    // 2. SQLite Database in Desktop App
    if (window.gorillaPunch?.game?.saveScore) {
      void window.gorillaPunch.game.saveScore(roundedScore).then(result => {
        if (result?.localBest && worldRef.current) {
          worldRef.current.best = Math.max(worldRef.current.best, result.localBest);
        }
      });
    }

    propsRef.current.onScoreSave?.(roundedScore, roundedBest);
  }

  function step(dt: number, w: number, h: number) {
    const world = worldRef.current!;
    const p = propsRef.current;
    const S = Math.max(0.5, Math.min(w / REF_W, h / REF_H, 3));
    const px = ART * S;
    const groundY = h * GROUND_RATIO;
    const playerX = w * 0.08;

    world.t += dt;
    idleRef.current += dt;

    if (world.dead) {
      if (world.t - world.deadAt > 0.9) {
        const best = Math.max(world.best, world.score);
        const played = world.played;
        worldRef.current = fresh(best, played);
        seed(worldRef.current, w, h);
      }
      return;
    }

    const base = p.startSpeed ?? startSpeed;
    const cap = Math.max(base, p.maxSpeed ?? maxSpeed);
    const sp = Math.min(cap, base + world.dist / 260) * S;
    world.speed = sp;
    world.dist += sp * dt;
    world.score = world.dist / 24;

    if (!world.grounded) {
      world.playerV -= (p.gravity ?? gravity) * S * dt;
      world.playerY += world.playerV * dt;
      if (world.playerY <= 0) {
        world.playerY = 0;
        world.playerV = 0;
        world.grounded = true;
      }
    }

    for (const ob of world.obstacles) ob.x -= sp * dt;
    world.obstacles = world.obstacles.filter((o) => o.x > -20 * px);
    const last = world.obstacles.length
      ? Math.max(...world.obstacles.map((o) => o.x))
      : -Infinity;

    const flight = (2 * (p.jump ?? jump)) / (p.gravity ?? gravity);
    const clear = (sp / S) * flight + (BLOCK_UNITS + 20) * ART;
    if (last < w - (clear + world.nextGap) * S) {
      const r = rng(world);
      let stack = r < 0.55 ? 1 : r < 0.87 ? 2 : 3;

      while (stack > 0 && !jumpWindow(stack, sp, S).ok) stack--;
      if (stack > 0) {
        world.obstacles.push({
          x: w + 8 * px,
          stack,
          glyph: Math.floor(rng(world) * GLYPHS.length),
        });
      }

      world.nextGap = rng(world) * 380;
    }

    for (const cl of world.clouds) cl.x -= sp * dt * (0.12 + 0.22 * cl.depth);
    world.clouds = world.clouds.filter((c) => c.x > -30 * px);
    if (world.clouds.length < 5 && rng(world) < 0.012) {
      world.clouds.push({
        x: w + 10 * px,
        y: 0.1 + rng(world) * 0.42,
        scale: 0.75 + rng(world) * 0.9,
        depth: rng(world),
      });
    }

    const auto =
      (p.attract ?? attract) &&
      (!world.played || idleRef.current > IDLE_RESUME);
    if (auto && world.grounded) {
      const bu = BLOCK_UNITS * px;
      const monkeyUnit = px * MONKEY_SCALE;
      const plFront = playerX + (MONKEY_HITBOX.left + MONKEY_HITBOX.width) * monkeyUnit;
      let next: Obstacle | null = null;
      let gap = Infinity;
      for (const ob of world.obstacles) {
        const left = ob.x + bu * 0.12;
        if (left + bu * 0.76 <= plFront) continue;
        if (left - plFront < gap) {
          gap = left - plFront;
          next = ob;
        }
      }

      if (next) {
        const win = jumpWindow(next.stack, sp, S);
        if (win.ok && gap <= sp * win.lead) doJump();
      }
    }

    const monkeyUnit = px * MONKEY_SCALE;
    const pl = {
      x: playerX + MONKEY_HITBOX.left * monkeyUnit,
      y: groundY - world.playerY - (MONKEY_HITBOX.top + MONKEY_HITBOX.height) * monkeyUnit,
      w: MONKEY_HITBOX.width * monkeyUnit,
      h: MONKEY_HITBOX.height * monkeyUnit,
    };
    for (const ob of world.obstacles) {
      const bu = BLOCK_UNITS * px;
      const box = {
        x: ob.x + bu * 0.12,
        y: groundY - ob.stack * bu,
        w: bu * 0.76,
        h: ob.stack * bu,
      };
      if (
        pl.x < box.x + box.w &&
        pl.x + pl.w > box.x &&
        pl.y < box.y + box.h &&
        pl.y + pl.h > box.y
      ) {
        world.dead = true;
        world.deadAt = world.t;
        const newBest = Math.max(world.best, world.score);
        world.best = newBest;
        recordScore(world.score, newBest);
        break;
      }
    }
  }

  function seed(world: World, w: number, h: number) {
    const S = Math.max(0.3, Math.min(w / REF_W, h / REF_H, 3));
    const px = ART * S;
    world.clouds = [
      { x: w * 0.17, y: 0.18, scale: 1.15, depth: 0.2 },
      { x: w * 0.44, y: 0.11, scale: 0.85, depth: 0.7 },
      { x: w * 0.78, y: 0.26, scale: 1.35, depth: 0.45 },
    ];

    const sp = (propsRef.current.startSpeed ?? startSpeed) * S;
    world.obstacles = [];
    for (const [at, want, glyph] of [
      [0.62, 2, 0],
      [1.02, 1, 2],
    ] as [number, number, number][]) {
      let stack = want;
      while (stack > 0 && !jumpWindow(stack, sp, S).ok) stack--;
      if (stack > 0) world.obstacles.push({ x: w * at, stack, glyph });
    }
    world.dist = 40 * px;
  }

  function doJump() {
    const world = worldRef.current;
    if (!world || propsRef.current.paused || world.dead || !world.grounded) return;
    const p = propsRef.current;
    const host = hostRef.current;
    const h = host ? host.clientHeight || REF_H : REF_H;
    const w = host ? host.clientWidth || REF_W : REF_W;
    const S = Math.max(0.3, Math.min(w / REF_W, h / REF_H, 3));
    world.playerV = (p.jump ?? jump) * S;
    world.grounded = false;
  }

  const doJumpRef = useRef(doJump);
  doJumpRef.current = doJump;
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const stepRef = useRef(step);
  stepRef.current = step;

  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const measure = () => {
      const r = host.getBoundingClientRect();
      const cw = Math.max(1, Math.round(host.clientWidth || r.width || REF_W));
      const ch = Math.max(1, Math.round(host.clientHeight || r.height || REF_H));
      if (cw === w && ch === h) return false;
      w = cw;
      h = ch;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    };

    measure();
    if (!worldRef.current!.obstacles.length) seedRef.current(worldRef.current!, w, h);

    paintRef.current(ctx, w, h);

    const ro = new ResizeObserver(() => {
      if (measure()) paintRef.current(ctx, w, h);
    });
    ro.observe(host);

    lastRef.current = 0;
    const frame = (now: number) => {
      const prev = lastRef.current || now;
      lastRef.current = now;
      const dt = Math.min(0.05, (now - prev) / 1000);
      if (dt > 0 && !propsRef.current.paused) stepRef.current(dt, w, h);
      paintRef.current(ctx, w, h);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;

    const play = () => {
      const world = worldRef.current;
      if (world) world.played = true;
      idleRef.current = 0;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mine =
        hoverRef.current ||
        (host !== null && typeof document !== "undefined" && document.activeElement === host);
      if (!mine) return;
      if (e.code === "KeyP" || e.key.toLowerCase() === "p") {
        e.preventDefault();
        propsRef.current.onPauseToggle?.();
        return;
      }
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        if (propsRef.current.paused) return;
        play();
        doJumpRef.current();
      }
    };
    const onPointer = (e: Event) => {
      e.preventDefault();
      if (propsRef.current.paused) return;
      play();
      doJumpRef.current();
    };
    const onEnter = () => {
      hoverRef.current = true;
    };
    const onLeave = () => {
      hoverRef.current = false;
    };

    window.addEventListener("keydown", onKey, { passive: false });
    host?.addEventListener("pointerdown", onPointer);
    host?.addEventListener("pointerenter", onEnter);
    host?.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      host?.removeEventListener("pointerdown", onPointer);
      host?.removeEventListener("pointerenter", onEnter);
      host?.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      tabIndex={0}
      role="region"
      aria-label="Gorilla Run Pixel Game"
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 140,
        overflow: "hidden",
        background,
        touchAction: "manipulation",
        cursor: props.paused ? "default" : "pointer",
        outline: "none",
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}

export default PixelGame;
