/**
 * Bakes the tile map into a grid of RenderTextures, once, at boot.
 *
 * Drawing 2,464 tiles of grass tone, dirt blobs, water gradients and scatter
 * every frame would be hopeless on a phone. Instead each 14×14-tile chunk is
 * painted a single time into its own texture, and the camera then just moves
 * over 16 static images.
 */

import { CHUNK_TILES, PATHS, PATH_RADIUS, TILE, WORLD } from '@ambervale/game-config';
import type Phaser from 'phaser';
import { h01 } from './rng';
import { Tile, type WorldMap } from './tilemap';

const COLORS = {
  grassMid: 0x56904a,
  grassDark: 0x477d3d,
  grassLight: 0x649a52,
  meadowLight: 0x86b96a,
  meadowDark: 0x2f5c34,
  dirt: 0x9a7a4f,
  dirtDark: 0x876a43,
  dirtSpeckle: 0xb59468,
  waterShallow: 0x4a94b8,
  waterDeep: 0x1f5878,
  foam: 0xcfe8f2,
  lily: 0x3f7a3a,
  lilyLight: 0x57a44c,
  flowerA: 0xf4d35e,
  flowerB: 0xe8e8e8,
  flowerC: 0xd98cb3,
  pebble: 0x9aa0a8,
  tuft: 0x3d6f34,
} as const;

export interface Terrain {
  readonly chunks: Phaser.GameObjects.RenderTexture[];
  /** Milliseconds the bake took — surfaced by the debug overlay. */
  readonly bakeMs: number;
  destroy(): void;
}

const inBounds = (tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < WORLD.w && ty < WORLD.h;

/**
 * Path centre-line samples in world pixels, computed once.
 *
 * WorldMap.at() reports out-of-bounds tiles as water so that collision treats
 * the map edge as impassable. Water painting therefore must bounds-check
 * explicitly, or every chunk on the world border paints a ring of sea.
 */
let pathSamples: { x: number; y: number }[] | null = null;

function getPathSamples(): { x: number; y: number }[] {
  if (pathSamples) return pathSamples;
  const out: { x: number; y: number }[] = [];
  for (const line of PATHS) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil((len * TILE) / 8));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        out.push({
          x: (a.x + (b.x - a.x) * t) * TILE + TILE / 2,
          y: (a.y + (b.y - a.y) * t) * TILE + TILE / 2,
        });
      }
    }
  }
  pathSamples = out;
  return out;
}

/**
 * Paints one chunk into `g`, in chunk-local pixel coordinates.
 *
 * Order matters: base grass, tone patches, meadow shading, dirt, water, then
 * scatter on top.
 */
function paintChunk(
  g: Phaser.GameObjects.Graphics,
  map: WorldMap,
  tx0: number,
  ty0: number,
  tw: number,
  th: number,
) {
  const lx = (tx: number) => (tx - tx0) * TILE;
  const ly = (ty: number) => (ty - ty0) * TILE;

  // 1. base
  g.fillStyle(COLORS.grassMid, 1);
  g.fillRect(0, 0, tw * TILE, th * TILE);

  // 2. rounded tone patches — overlapping circles union into soft blobs
  for (const [kind, color] of [
    [Tile.Grass0, COLORS.grassDark],
    [Tile.Grass2, COLORS.grassLight],
  ] as const) {
    g.fillStyle(color, 1);
    for (let ty = ty0; ty < ty0 + th; ty++) {
      for (let tx = tx0; tx < tx0 + tw; tx++) {
        if (map.at(tx, ty) !== kind) continue;
        g.fillCircle(lx(tx) + TILE / 2, ly(ty) + TILE / 2, TILE * 0.72);
      }
    }
  }

  // 3. large-scale radial meadow shading, sampled coarsely and blended soft
  for (let ty = ty0 - 1; ty < ty0 + th + 1; ty += 2) {
    for (let tx = tx0 - 1; tx < tx0 + tw + 1; tx += 2) {
      const m =
        map.meadow[
          Math.max(0, Math.min(WORLD.h - 1, ty)) * WORLD.w + Math.max(0, Math.min(WORLD.w - 1, tx))
        ] ?? 0.5;
      const d = m - 0.5;
      if (Math.abs(d) < 0.06) continue;
      g.fillStyle(
        d > 0 ? COLORS.meadowLight : COLORS.meadowDark,
        Math.min(0.16, Math.abs(d) * 0.5),
      );
      g.fillCircle(lx(tx) + TILE / 2, ly(ty) + TILE / 2, TILE * 2.1);
    }
  }

  // 4. dirt paths.
  //
  // Drawn by walking the actual PATHS polylines rather than by stamping one
  // circle per classified tile: on a diagonal run the dirt tiles are 1.41
  // tiles apart, so per-tile stamps read as a chain of beads instead of a
  // track. Sampling along the line at sub-tile spacing merges cleanly.
  const stampPath = (color: number, radius: number) => {
    g.fillStyle(color, 1);
    for (const p of getPathSamples()) {
      // Skip stamps well outside this chunk.
      const cxp = p.x - tx0 * TILE;
      const cyp = p.y - ty0 * TILE;
      if (cxp < -TILE * 2 || cyp < -TILE * 2) continue;
      if (cxp > (tw + 2) * TILE || cyp > (th + 2) * TILE) continue;
      g.fillCircle(cxp, cyp, radius);
    }
  };
  stampPath(COLORS.dirtDark, PATH_RADIUS * TILE * 1.12);
  stampPath(COLORS.dirt, PATH_RADIUS * TILE * 0.92);
  for (let ty = ty0; ty < ty0 + th; ty++) {
    for (let tx = tx0; tx < tx0 + tw; tx++) {
      if (map.at(tx, ty) !== Tile.Dirt) continue;
      for (let k = 0; k < 5; k++) {
        // Keep speckle inside the blob rather than spraying the whole tile.
        const hx = 0.25 + h01(tx, ty, 40 + k) * 0.5;
        const hy = 0.25 + h01(tx, ty, 70 + k) * 0.5;
        g.fillStyle(COLORS.dirtSpeckle, 0.5);
        g.fillCircle(lx(tx) + hx * TILE, ly(ty) + hy * TILE, 1.4 + h01(tx, ty, 90 + k) * 1.4);
      }
    }
  }

  // 5. water — a foam rim, shallow base, then deep core.
  //
  // The rim is a slightly larger blob painted *under* the water rather than a
  // stroke around each shore tile: stroking per tile draws whole circles, so
  // the rings show up in open water as well as at the edge.
  g.fillStyle(COLORS.foam, 0.5);
  for (let ty = ty0 - 1; ty < ty0 + th + 1; ty++) {
    for (let tx = tx0 - 1; tx < tx0 + tw + 1; tx++) {
      if (!inBounds(tx, ty) || !map.isWater(tx, ty)) continue;
      g.fillCircle(lx(tx) + TILE / 2, ly(ty) + TILE / 2, TILE * 0.92);
    }
  }
  g.fillStyle(COLORS.waterShallow, 1);
  for (let ty = ty0 - 1; ty < ty0 + th + 1; ty++) {
    for (let tx = tx0 - 1; tx < tx0 + tw + 1; tx++) {
      if (!inBounds(tx, ty) || !map.isWater(tx, ty)) continue;
      g.fillCircle(lx(tx) + TILE / 2, ly(ty) + TILE / 2, TILE * 0.82);
    }
  }
  // inner gradient: three depth bands, each smaller and darker
  for (const [threshold, alpha, radius] of [
    [0.3, 0.5, 0.66],
    [0.55, 0.6, 0.62],
    [0.75, 0.7, 0.58],
  ] as const) {
    g.fillStyle(COLORS.waterDeep, alpha);
    for (let ty = ty0 - 1; ty < ty0 + th + 1; ty++) {
      for (let tx = tx0 - 1; tx < tx0 + tw + 1; tx++) {
        if (!inBounds(tx, ty) || !map.isWater(tx, ty)) continue;
        if (map.depthAt(tx, ty) < threshold) continue;
        g.fillCircle(lx(tx) + TILE / 2, ly(ty) + TILE / 2, TILE * radius);
      }
    }
  }

  // 6. lily pads in shallow water
  for (let ty = ty0; ty < ty0 + th; ty++) {
    for (let tx = tx0; tx < tx0 + tw; tx++) {
      if (!map.isWater(tx, ty)) continue;
      const d = map.depthAt(tx, ty);
      if (d > 0.45 || h01(tx, ty, 11) > 0.16) continue;
      const cx = lx(tx) + TILE * (0.25 + h01(tx, ty, 12) * 0.5);
      const cy = ly(ty) + TILE * (0.25 + h01(tx, ty, 13) * 0.5);
      const r = 7 + h01(tx, ty, 14) * 5;
      g.fillStyle(COLORS.lily, 1);
      g.fillCircle(cx, cy, r);
      g.fillStyle(COLORS.lilyLight, 0.7);
      g.fillCircle(cx - r * 0.25, cy - r * 0.25, r * 0.45);
    }
  }

  // 7. scatter: tufts, flowers, pebbles — never on dirt or water
  for (let ty = ty0; ty < ty0 + th; ty++) {
    for (let tx = tx0; tx < tx0 + tw; tx++) {
      const kind = map.at(tx, ty);
      if (kind === Tile.Water || kind === Tile.Dirt) continue;

      // grass tufts
      if (h01(tx, ty, 21) < 0.34) {
        const cx = lx(tx) + TILE * (0.15 + h01(tx, ty, 22) * 0.7);
        const cy = ly(ty) + TILE * (0.15 + h01(tx, ty, 23) * 0.7);
        g.lineStyle(2, COLORS.tuft, 0.75);
        for (let b = -1; b <= 1; b++) {
          g.lineBetween(cx + b * 3, cy, cx + b * 5, cy - 7 - h01(tx, ty, 24 + b) * 4);
        }
      }

      // flowers
      const fh = h01(tx, ty, 31);
      if (fh < 0.09) {
        const cx = lx(tx) + TILE * (0.2 + h01(tx, ty, 32) * 0.6);
        const cy = ly(ty) + TILE * (0.2 + h01(tx, ty, 33) * 0.6);
        const color = fh < 0.03 ? COLORS.flowerA : fh < 0.06 ? COLORS.flowerB : COLORS.flowerC;
        g.fillStyle(color, 1);
        for (let p = 0; p < 4; p++) {
          const a = (p * Math.PI) / 2;
          g.fillCircle(cx + Math.cos(a) * 2.6, cy + Math.sin(a) * 2.6, 2.2);
        }
        g.fillStyle(COLORS.flowerA, 1);
        g.fillCircle(cx, cy, 1.5);
      }

      // pebbles
      if (h01(tx, ty, 41) < 0.06) {
        const cx = lx(tx) + TILE * (0.2 + h01(tx, ty, 42) * 0.6);
        const cy = ly(ty) + TILE * (0.2 + h01(tx, ty, 43) * 0.6);
        g.fillStyle(COLORS.pebble, 0.85);
        g.fillEllipse(cx, cy, 6 + h01(tx, ty, 44) * 4, 4 + h01(tx, ty, 45) * 3);
      }
    }
  }
}

/**
 * Bakes all chunks. Returns the RenderTextures already positioned in world
 * space, with the Light2D pipeline attached so day/night lighting affects them.
 */
export function bakeTerrain(scene: Phaser.Scene, map: WorldMap): Terrain {
  const t0 = performance.now();
  const chunks: Phaser.GameObjects.RenderTexture[] = [];

  const cols = Math.ceil(WORLD.w / CHUNK_TILES);
  const rows = Math.ceil(WORLD.h / CHUNK_TILES);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const tx0 = cx * CHUNK_TILES;
      const ty0 = cy * CHUNK_TILES;
      const tw = Math.min(CHUNK_TILES, WORLD.w - tx0);
      const th = Math.min(CHUNK_TILES, WORLD.h - ty0);

      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      paintChunk(g, map, tx0, ty0, tw, th);

      const rt = scene.add.renderTexture(tx0 * TILE, ty0 * TILE, tw * TILE, th * TILE);
      rt.setOrigin(0, 0);
      rt.draw(g);
      rt.setDepth(-1000);
      rt.setPipeline('Light2D');
      g.destroy();

      chunks.push(rt);
    }
  }

  return {
    chunks,
    bakeMs: performance.now() - t0,
    destroy() {
      for (const c of chunks) c.destroy();
      chunks.length = 0;
    },
  };
}
