/**
 * Title-screen camera.
 *
 * Before the player presses Start, the camera drifts along the CINE waypoints
 * — house, field, market, lake, windmill — easing between each so the world
 * shows itself off behind the title panel. Handing over to gameplay is a
 * single `release()` call.
 */

import { CINE, CINE_ZOOM_SCALE, TILE, baseZoom } from '@ambervale/game-config';
import type Phaser from 'phaser';

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class CineCamera {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly scene: Phaser.Scene;
  private leg = 0;
  private elapsed = 0;
  private active = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.camera = scene.cameras.main;

    const first = CINE[0]!;
    this.camera.centerOn(first.x * TILE, first.y * TILE);
    this.camera.setZoom(this.zoom());
  }

  private zoom(): number {
    const { width, height } = this.scene.scale;
    return baseZoom(width, height) * CINE_ZOOM_SCALE;
  }

  get isActive(): boolean {
    return this.active;
  }

  update(deltaMs: number): void {
    if (!this.active || CINE.length < 2) return;

    const from = CINE[this.leg % CINE.length]!;
    const to = CINE[(this.leg + 1) % CINE.length]!;
    const legSec = to.sec;

    this.elapsed += deltaMs / 1000;
    const t = Math.min(1, this.elapsed / legSec);
    const e = easeInOut(t);

    this.camera.centerOn(
      (from.x + (to.x - from.x) * e) * TILE,
      (from.y + (to.y - from.y) * e) * TILE,
    );
    this.camera.setZoom(this.zoom());

    if (t >= 1) {
      this.elapsed = 0;
      this.leg = (this.leg + 1) % CINE.length;
    }
  }

  /** Stops the drift and hands the camera to a follow target. */
  release(target: Phaser.GameObjects.GameObject, durationMs = 900): void {
    if (!this.active) return;
    this.active = false;

    const { width, height } = this.scene.scale;
    this.camera.startFollow(target, true, 0.09, 0.09);
    this.camera.zoomTo(baseZoom(width, height), durationMs, 'Sine.easeInOut');
  }
}
