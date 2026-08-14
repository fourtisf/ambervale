/**
 * Places every static object: buildings, fences, lamps, the dock and rowboat,
 * the north-meadow sign and its dashed ghost plots.
 *
 * Sprites are y-sorted by setting depth to their world y, so the player walks
 * behind a building's back wall and in front of its base without any explicit
 * layer bookkeeping.
 */

import {
  DOCK_PLANKS,
  FENCES,
  LAMPS,
  PLOTS,
  STRUCTURES,
  TILE,
  WORLD,
  structureAt,
} from '@ambervale/game-config';
import type Phaser from 'phaser';
import { h01 } from './rng';
import { SPRITE_SCALE } from './textures';

/** Sprites that need per-frame animation. */
export interface LayoutRefs {
  windmillBlades: Phaser.GameObjects.Image;
  rowboat: Phaser.GameObjects.Image;
  /** Dashed outlines for the locked north plots; hidden once expanded. */
  ghostPlots: Phaser.GameObjects.Graphics;
  /** Standing sprites tall enough to hide the player; see Occlusion. */
  occluders: Phaser.GameObjects.Image[];
}

/** Sprites drawn bottom-anchored, sorted by their feet. */
function place(scene: Phaser.Scene, key: string, tx: number, ty: number): Phaser.GameObjects.Image {
  const img = scene.add.image(tx * TILE + TILE / 2, ty * TILE + TILE, key);
  img
    .setOrigin(0.5, 1)
    .setScale(SPRITE_SCALE)
    .setDepth(ty * TILE);
  img.setPipeline('Light2D');
  return img;
}

function drawGhostPlots(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(-500);
  g.setPipeline('Light2D');

  const dash = 10;
  const gap = 7;
  g.lineStyle(2.5, 0xf5e6c8, 0.42);

  for (const plot of PLOTS) {
    if (plot.zone !== 'north') continue;
    const x = plot.x * TILE + 6;
    const y = plot.y * TILE + 6;
    const w = TILE - 12;
    const h = TILE - 12;

    // Manual dashes — Phaser's Graphics has no dashed stroke.
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      for (let d = 0; d < len; d += dash + gap) {
        const e = Math.min(d + dash, len);
        g.lineBetween(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
      }
    };
    edge(x, y, x + w, y);
    edge(x + w, y, x + w, y + h);
    edge(x + w, y + h, x, y + h);
    edge(x, y + h, x, y);
  }

  return g;
}

export function buildLayout(scene: Phaser.Scene): LayoutRefs {
  // Dock planks lie flat on the water, below everything that stands on them.
  for (const plank of DOCK_PLANKS) {
    scene.add
      .image(plank.x * TILE + TILE / 2, plank.y * TILE + TILE / 2, 'dockPlank')
      .setOrigin(0.5, 0.5)
      .setScale(SPRITE_SCALE)
      .setDepth(-800)
      .setPipeline('Light2D');
  }

  // Fences, from tile-space rectangles to runs of rail sprites.
  for (const fence of FENCES) {
    const horizontal = fence.w >= fence.h;
    const steps = Math.max(1, Math.round(horizontal ? fence.w : fence.h));
    for (let i = 0; i < steps; i++) {
      const tx = horizontal ? fence.x + i : fence.x;
      const ty = horizontal ? fence.y : fence.y + i;
      scene.add
        .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2, horizontal ? 'fenceH' : 'fenceV')
        .setOrigin(0.5, 0.5)
        .setScale(SPRITE_SCALE)
        .setDepth(ty * TILE)
        .setPipeline('Light2D');
    }
  }

  const ghostPlots = drawGhostPlots(scene);
  const occluders: Phaser.GameObjects.Image[] = [];

  let rowboat: Phaser.GameObjects.Image | undefined;

  for (const s of STRUCTURES) {
    if (s.key === 'dock') continue; // planks already drawn
    if (s.key === 'rowboat') {
      rowboat = scene.add
        .image(s.x * TILE + TILE / 2, s.y * TILE + TILE / 2, 'rowboat')
        .setOrigin(0.5, 0.5)
        .setScale(SPRITE_SCALE)
        .setDepth(s.y * TILE)
        .setPipeline('Light2D');
      continue;
    }
    occluders.push(place(scene, s.key, s.x, s.y));
  }

  // Blades pivot about their own centre, in front of the mill's cap.
  const mill = structureAt('windmill');
  const windmillBlades = scene.add
    .image(mill.x * TILE + TILE / 2, (mill.y - 1.55) * TILE, 'windmillBlades')
    .setOrigin(0.5, 0.5)
    .setScale(SPRITE_SCALE)
    .setDepth(mill.y * TILE + 1)
    .setPipeline('Light2D');

  // Lamps stand slightly proud of their tile so light reads above the post.
  for (const lamp of LAMPS) {
    occluders.push(place(scene, 'lamp', lamp.x, lamp.y));
  }

  // North meadow signpost.
  const sign = structureAt('sign');
  scene.add
    .text(sign.x * TILE + TILE / 2, (sign.y - 0.42) * TILE, 'NORTH MEADOW', {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#4d3521',
    })
    .setOrigin(0.5, 0.5)
    .setDepth(sign.y * TILE + 1);

  return { windmillBlades, rowboat: rowboat!, ghostPlots, occluders };
}

/**
 * Decorative greenery — pines and bushes scattered by tile hash, kept off
 * paths, water and the farm hub. Harvestable oaks and rocks are NOT placed
 * here: those are server-owned entities, spawned from NODE_SLOTS in Phase 3.
 */
export function buildScenery(
  scene: Phaser.Scene,
  isBlocked: (tx: number, ty: number) => boolean,
): Phaser.GameObjects.Image[] {
  const placed: Phaser.GameObjects.Image[] = [];

  for (let ty = 1; ty < WORLD.h - 1; ty++) {
    for (let tx = 1; tx < WORLD.w - 1; tx++) {
      if (isBlocked(tx, ty)) continue;

      // Keep the farm hub clear so the playable area stays readable.
      if (tx > 9 && tx < 30 && ty > 10 && ty < 30) continue;

      const roll = h01(tx, ty, 101);
      if (roll < 0.035) placed.push(place(scene, 'pine', tx, ty));
      else if (roll < 0.075) placed.push(place(scene, 'bush', tx, ty));
    }
  }

  return placed;
}
