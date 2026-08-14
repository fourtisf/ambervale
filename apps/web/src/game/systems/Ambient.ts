/**
 * Cosmetic world life: water shimmer, chimney smoke, fireflies, dust motes.
 *
 * None of this touches gameplay state. Everything pauses when the tab is
 * hidden — a backgrounded tab should not be spending battery animating
 * fireflies nobody is looking at.
 */

import { TILE, WORLD, structureAt } from '@ambervale/game-config';
import * as Phaser from 'phaser';
import { h01 } from '../world/rng';
import { type WorldMap } from '../world/tilemap';

const SHIMMER_COUNT = 90;
const DUST_COUNT = 34;
const FIREFLY_COUNT = 26;

interface Shimmer {
  gfx: Phaser.GameObjects.Rectangle;
  baseX: number;
  baseY: number;
  phase: number;
  width: number;
}

interface Drifter {
  gfx: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  phase: number;
  baseAlpha: number;
}

export class Ambient {
  private readonly scene: Phaser.Scene;
  private readonly shimmers: Shimmer[] = [];
  private readonly dust: Drifter[] = [];
  private readonly fireflies: Drifter[] = [];
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private time = 0;
  private paused = false;

  constructor(scene: Phaser.Scene, map: WorldMap) {
    this.scene = scene;
    this.buildShimmer(map);
    this.buildSmoke();
    this.buildDrifters();

    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    this.paused = document.hidden;
    this.smoke.emitting = !this.paused;
  };

  /** Short horizontal highlights that slide across open water. */
  private buildShimmer(map: WorldMap): void {
    const waterTiles: { x: number; y: number }[] = [];
    for (let ty = 0; ty < WORLD.h; ty++) {
      for (let tx = 0; tx < WORLD.w; tx++) {
        if (map.isWater(tx, ty) && map.depthAt(tx, ty) > 0.25) waterTiles.push({ x: tx, y: ty });
      }
    }
    if (waterTiles.length === 0) return;

    for (let i = 0; i < SHIMMER_COUNT; i++) {
      const t = waterTiles[Math.floor(h01(i, 7, 3) * waterTiles.length)]!;
      const x = t.x * TILE + h01(i, 8, 4) * TILE;
      const y = t.y * TILE + h01(i, 9, 5) * TILE;
      const width = 10 + h01(i, 10, 6) * 18;

      const gfx = this.scene.add
        .rectangle(x, y, width, 2, 0xdff2fb, 0.45)
        .setDepth(-900)
        .setBlendMode(Phaser.BlendModes.ADD);

      this.shimmers.push({ gfx, baseX: x, baseY: y, phase: h01(i, 11, 7) * Math.PI * 2, width });
    }
  }

  /** Chimney smoke from the farmhouse. */
  private buildSmoke(): void {
    const house = structureAt('house');
    const x = (house.x + 1.5) * TILE;
    const y = (house.y - 1.7) * TILE;

    this.smoke = this.scene.add.particles(x, y, '__WHITE', {
      lifespan: 3400,
      speedY: { min: -26, max: -14 },
      speedX: { min: -8, max: 10 },
      scale: { start: 0.35, end: 1.5 },
      alpha: { start: 0.32, end: 0 },
      tint: 0xe8e4dc,
      frequency: 420,
      blendMode: Phaser.BlendModes.NORMAL,
    });
    this.smoke.setDepth(600);
  }

  private buildDrifters(): void {
    const spawn = (
      list: Drifter[],
      count: number,
      radius: number,
      color: number,
      alpha: number,
      salt: number,
      blend: Phaser.BlendModes,
    ) => {
      for (let i = 0; i < count; i++) {
        const x = h01(i, salt, 1) * WORLD.w * TILE;
        const y = h01(i, salt, 2) * WORLD.h * TILE;
        const gfx = this.scene.add
          .circle(x, y, radius, color, alpha)
          .setDepth(700)
          .setBlendMode(blend);
        list.push({
          gfx,
          vx: (h01(i, salt, 3) - 0.5) * 14,
          vy: (h01(i, salt, 4) - 0.5) * 10,
          phase: h01(i, salt, 5) * Math.PI * 2,
          baseAlpha: alpha,
        });
      }
    };

    spawn(this.dust, DUST_COUNT, 1.6, 0xfff4d8, 0.3, 21, Phaser.BlendModes.ADD);
    spawn(this.fireflies, FIREFLY_COUNT, 2.6, 0xc9ff8a, 0.9, 31, Phaser.BlendModes.ADD);
  }

  /**
   * @param nightAmount 0 by day → 1 at full night. Fireflies fade in with it,
   *                    dust motes fade out.
   */
  update(deltaMs: number, nightAmount: number): void {
    if (this.paused) return;
    const dt = deltaMs / 1000;
    this.time += dt;

    for (const s of this.shimmers) {
      const t = this.time * 0.9 + s.phase;
      s.gfx.x = s.baseX + Math.sin(t) * 9;
      s.gfx.setAlpha(0.18 + (Math.sin(t * 1.7) * 0.5 + 0.5) * 0.32);
      s.gfx.width = s.width * (0.7 + (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.6);
    }

    const drift = (list: Drifter[], visibility: number) => {
      for (const d of list) {
        d.gfx.x += d.vx * dt;
        d.gfx.y += d.vy * dt + Math.sin(this.time * 1.3 + d.phase) * 4 * dt;

        // Wrap rather than respawn, so the field never visibly empties.
        const w = WORLD.w * TILE;
        const h = WORLD.h * TILE;
        if (d.gfx.x < 0) d.gfx.x += w;
        if (d.gfx.x > w) d.gfx.x -= w;
        if (d.gfx.y < 0) d.gfx.y += h;
        if (d.gfx.y > h) d.gfx.y -= h;

        const twinkle = 0.55 + 0.45 * Math.sin(this.time * 2.4 + d.phase);
        d.gfx.setAlpha(d.baseAlpha * visibility * twinkle);
      }
    };

    drift(this.dust, 1 - nightAmount);
    drift(this.fireflies, nightAmount);
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const s of this.shimmers) s.gfx.destroy();
    for (const d of [...this.dust, ...this.fireflies]) d.gfx.destroy();
    this.smoke.destroy();
  }
}
