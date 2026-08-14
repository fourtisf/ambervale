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

/**
 * Palette.
 *
 * The three grass tones are deliberately further apart than they look on a
 * swatch: at 64px per tile, tones within a few percent of each other read as
 * one flat colour and the whole meadow goes dead. Warmth also increases with
 * lightness, so patches feel sunlit rather than merely paler.
 */
const COLORS = {
  grassMid: 0x5a9a4a,
  grassDark: 0x4e8b41,
  grassLight: 0x68a851,
  meadowLight: 0x93c76a,
  meadowDark: 0x2c5c33,
  dirt: 0xa8855a,
  dirtDark: 0x8a6a42,
  dirtEdge: 0x6f5334,
  dirtSpeckle: 0xc2a074,
  waterShallow: 0x4a9cc0,
  waterDeep: 0x1d5a7c,
  foam: 0xd6ecf6,
  lily: 0x3f7a3a,
  lilyLight: 0x62b055,
  flowerA: 0xffdf6b,
  flowerB: 0xfdf6e3,
  flowerC: 0xe89bc4,
  flowerD: 0xb49ae8,
  pebble: 0x9aa0a8,
  tuft: 0x376b30,
  tuftLight: 0x5e9c48,
  clover: 0x4d8c40,
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

  // 2. rounded tone patches.
  //
  // Drawn fully opaque. Translucent stamps look like the gentler choice but
  // are strictly worse: every overlap double-blends, so the seam of every
  // individual circle becomes visible and the meadow turns into a field of
  // rings. Opaque fills union seamlessly, and subtlety comes from keeping the
  // tones close together instead. The jitter stays — it breaks up the tile
  // lattice that same-radius stamps would otherwise reveal at the edges.
  for (const [kind, color] of [
    [Tile.Grass0, COLORS.grassDark],
    [Tile.Grass2, COLORS.grassLight],
  ] as const) {
    g.fillStyle(color, 1);
    for (let ty = ty0 - 1; ty < ty0 + th + 1; ty++) {
      for (let tx = tx0 - 1; tx < tx0 + tw + 1; tx++) {
        if (!inBounds(tx, ty) || map.at(tx, ty) !== kind) continue;
        const jx = (h01(tx, ty, 61) - 0.5) * TILE * 0.35;
        const jy = (h01(tx, ty, 62) - 0.5) * TILE * 0.35;
        const r = TILE * (0.6 + h01(tx, ty, 63) * 0.24);
        g.fillCircle(lx(tx) + TILE / 2 + jx, ly(ty) + TILE / 2 + jy, r);
      }
    }
  }

  // 3. large-scale meadow shading.
  //
  // Many small, very faint stamps on a fine grid — not a few large ones on a
  // coarse grid. Big translucent circles on a 2-tile lattice read as distinct
  // stains: you can pick out every circle. Small overlapping stamps at a
  // third of the opacity dissolve into an actual gradient.
  for (let ty = ty0 - 2; ty < ty0 + th + 2; ty++) {
    for (let tx = tx0 - 2; tx < tx0 + tw + 2; tx++) {
      const cy = Math.max(0, Math.min(WORLD.h - 1, ty));
      const cx = Math.max(0, Math.min(WORLD.w - 1, tx));
      const m = map.meadow[cy * WORLD.w + cx] ?? 0.5;
      const d = m - 0.5;
      if (Math.abs(d) < 0.04) continue;
      g.fillStyle(
        d > 0 ? COLORS.meadowLight : COLORS.meadowDark,
        Math.min(0.05, Math.abs(d) * 0.14),
      );
      g.fillCircle(lx(tx) + TILE / 2, ly(ty) + TILE / 2, TILE * 1.35);
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
  // Three passes: a dark rim that reads as the trodden edge, the track itself,
  // and a lighter worn centre line. One flat band looks painted on.
  stampPath(COLORS.dirtEdge, PATH_RADIUS * TILE * 1.1);
  stampPath(COLORS.dirtDark, PATH_RADIUS * TILE * 0.95);
  stampPath(COLORS.dirt, PATH_RADIUS * TILE * 0.74);
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

  // 7. scatter: tufts, clover, flowers, pebbles — never on dirt or water.
  //
  // The rule that matters here is variation. An identical mark repeated on a
  // third of all tiles stops reading as grass and starts reading as a texture
  // bug — the eye locks onto the repeat instantly. So every stamp varies in
  // size, lean, blade count, colour and vertical offset, and the density is
  // lower than instinct suggests: sparse-but-varied looks far denser than
  // frequent-but-identical.
  for (let ty = ty0; ty < ty0 + th; ty++) {
    for (let tx = tx0; tx < tx0 + tw; tx++) {
      const kind = map.at(tx, ty);
      if (kind === Tile.Water || kind === Tile.Dirt) continue;

      // grass tufts
      const th01 = h01(tx, ty, 21);
      if (th01 < 0.26) {
        const cx = lx(tx) + TILE * (0.12 + h01(tx, ty, 22) * 0.76);
        const cy = ly(ty) + TILE * (0.12 + h01(tx, ty, 23) * 0.76);

        // Bigger tufts sit further back and are drawn darker, which gives the
        // meadow a sense of depth rather than a flat sticker layer.
        const scale = 0.7 + h01(tx, ty, 26) * 0.9;
        const blades = 2 + Math.floor(h01(tx, ty, 27) * 3);
        const lean = (h01(tx, ty, 28) - 0.5) * 5;
        const light = h01(tx, ty, 29) < 0.35;

        g.lineStyle(1.6 * scale, light ? COLORS.tuftLight : COLORS.tuft, 0.55 + scale * 0.2);
        for (let b = 0; b < blades; b++) {
          const off = (b - (blades - 1) / 2) * 3.4 * scale;
          const height = (6 + h01(tx, ty, 30 + b) * 6) * scale;
          g.lineBetween(cx + off, cy, cx + off + lean * 0.6, cy - height);
        }
      }

      // clover / leaf clusters — a second silhouette so tufts are not the only
      // shape on the ground
      if (th01 >= 0.26 && th01 < 0.34) {
        const cx = lx(tx) + TILE * (0.2 + h01(tx, ty, 51) * 0.6);
        const cy = ly(ty) + TILE * (0.2 + h01(tx, ty, 52) * 0.6);
        const r = 2.2 + h01(tx, ty, 53) * 1.6;
        g.fillStyle(COLORS.clover, 0.7);
        for (let p = 0; p < 3; p++) {
          const a = (p / 3) * Math.PI * 2 + h01(tx, ty, 54) * 2;
          g.fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.95);
        }
      }

      // flowers — a stem and an off-centre head, rather than a symmetric
      // four-dot rosette that reads as a sparkle artefact
      const fh = h01(tx, ty, 31);
      if (fh < 0.07) {
        const cx = lx(tx) + TILE * (0.2 + h01(tx, ty, 32) * 0.6);
        const cy = ly(ty) + TILE * (0.2 + h01(tx, ty, 33) * 0.6);
        const color =
          fh < 0.02
            ? COLORS.flowerA
            : fh < 0.04
              ? COLORS.flowerB
              : fh < 0.058
                ? COLORS.flowerC
                : COLORS.flowerD;
        const petals = 5;
        const r = 1.9 + h01(tx, ty, 34) * 1.1;

        g.lineStyle(1.2, COLORS.tuft, 0.6);
        g.lineBetween(cx, cy + 4.5, cx - 0.5, cy);

        g.fillStyle(color, 1);
        for (let p = 0; p < petals; p++) {
          const a = (p / petals) * Math.PI * 2 + h01(tx, ty, 35);
          g.fillCircle(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15, r * 0.85);
        }
        g.fillStyle(0xfff3c4, 1);
        g.fillCircle(cx, cy, r * 0.6);
      }

      // pebbles
      if (h01(tx, ty, 41) < 0.045) {
        const cx = lx(tx) + TILE * (0.2 + h01(tx, ty, 42) * 0.6);
        const cy = ly(ty) + TILE * (0.2 + h01(tx, ty, 43) * 0.6);
        const w = 5 + h01(tx, ty, 44) * 4;
        g.fillStyle(0x000000, 0.12);
        g.fillEllipse(cx, cy + 1.5, w, w * 0.6);
        g.fillStyle(COLORS.pebble, 0.9);
        g.fillEllipse(cx, cy, w, w * 0.66);
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
