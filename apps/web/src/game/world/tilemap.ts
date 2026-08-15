/**
 * Builds the 56×44 tile grid: water bodies, dirt paths and three grass tones.
 *
 * Pure data — no Phaser. The painter in terrain.ts reads this, and the
 * collision helper below is what the player controller walks against.
 */

import {
  DOCK_PLANKS,
  PATHS,
  PATH_RADIUS,
  STRUCTURES,
  TILE,
  WATER,
  WORLD,
  WORLD_SEED,
  type WaterBody,
} from '@ambervale/game-config';
import { ValueNoise, mulberry32 } from './rng';

export const enum Tile {
  Grass0 = 0,
  Grass1 = 1,
  Grass2 = 2,
  Dirt = 3,
  Water = 4,
}

export interface WorldMap {
  readonly w: number;
  readonly h: number;
  /** Row-major tile kinds. */
  readonly tiles: Uint8Array;
  /** 0 at the shoreline → 1 in the deepest water. Zero on land. */
  readonly depth: Float32Array;
  /** Large-scale meadow shading, [0,1], used for radial tone variation. */
  readonly meadow: Float32Array;
  readonly noise: ValueNoise;
  at(tx: number, ty: number): Tile;
  isWater(tx: number, ty: number): boolean;
  depthAt(tx: number, ty: number): number;
}

/** Distance from a point to a line segment, in tile units. */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Shortest distance from a tile to any path polyline. */
function distToPaths(tx: number, ty: number): number {
  let best = Infinity;
  for (const line of PATHS) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const d = distToSegment(tx, ty, a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Signed "insideness" of a water body: > 0 inside, scaled so 1 is the centre.
 * The radius is perturbed by fbm so shorelines are lobed rather than circular.
 */
function waterField(body: WaterBody, tx: number, ty: number, noise: ValueNoise): number {
  const d = Math.hypot(tx - body.cx, ty - body.cy);
  const wob = (noise.fbm(tx * 0.13 + body.cx, ty * 0.13 + body.cy, 3) - 0.5) * 2 * body.wobble;
  const r = body.r + wob;
  if (r <= 0) return -1;
  return (r - d) / r;
}

export function generateWorld(): WorldMap {
  const { w, h } = WORLD;
  const rng = mulberry32(WORLD_SEED);
  const noise = new ValueNoise(rng);

  const tiles = new Uint8Array(w * h);
  const depth = new Float32Array(w * h);
  const meadow = new Float32Array(w * h);

  const dockSet = new Set(DOCK_PLANKS.map((p) => `${p.x},${p.y}`));

  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;

      // Large-scale shading, sampled well below tile frequency.
      meadow[i] = noise.fbm(tx * 0.045, ty * 0.045, 3);

      const lake = waterField(WATER.lake, tx, ty, noise);
      const pond = waterField(WATER.pond, tx, ty, noise);
      const water = Math.max(lake, pond);

      if (water > 0) {
        tiles[i] = Tile.Water;
        depth[i] = Math.min(1, water);
        continue;
      }

      if (distToPaths(tx, ty) < PATH_RADIUS) {
        tiles[i] = Tile.Dirt;
        continue;
      }

      // Three grass tones from mid-frequency noise, so patches read as
      // meadow variation rather than per-tile static.
      const g = noise.fbm(tx * 0.11, ty * 0.11, 4);
      tiles[i] = g < 0.42 ? Tile.Grass0 : g < 0.6 ? Tile.Grass1 : Tile.Grass2;
    }
  }

  // The dock is planked over the lake — still water for rendering, but the
  // collision map below treats those tiles as walkable.
  void dockSet;

  const at = (tx: number, ty: number): Tile => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return Tile.Water;
    return tiles[ty * w + tx] as Tile;
  };

  return {
    w,
    h,
    tiles,
    depth,
    meadow,
    noise,
    at,
    isWater: (tx, ty) => at(tx, ty) === Tile.Water,
    depthAt: (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return 1;
      return depth[ty * w + tx]!;
    },
  };
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------

export interface Collision {
  /** True when a world-pixel position is blocked. */
  blocked(px: number, py: number): boolean;
  /** True on the dirt paths, which are quicker to walk than open meadow. */
  onPath(px: number, py: number): boolean;
}

/**
 * Water blocks movement except on dock planks; building footprints block their
 * solid box. Kept as a pixel-space predicate so the controller can sample it
 * per axis and slide along walls.
 */
export function buildCollision(map: WorldMap): Collision {
  const walkableWater = new Set(DOCK_PLANKS.map((p) => `${p.x},${p.y}`));

  const solids = STRUCTURES.filter((s) => s.solid).map((s) => {
    const solid = s.solid!;
    const offY = solid.offY ?? 0;
    return {
      x0: (s.x - solid.w / 2) * TILE,
      x1: (s.x + solid.w / 2) * TILE,
      y0: (s.y - solid.h + offY) * TILE,
      y1: (s.y + offY) * TILE,
    };
  });

  return {
    blocked(px: number, py: number): boolean {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);

      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
      if (map.isWater(tx, ty) && !walkableWater.has(`${tx},${ty}`)) return true;

      for (const s of solids) {
        if (px >= s.x0 && px <= s.x1 && py >= s.y0 && py <= s.y1) return true;
      }
      return false;
    },

    onPath(px: number, py: number): boolean {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
      return map.tiles[ty * map.w + tx] === Tile.Dirt;
    },
  };
}
