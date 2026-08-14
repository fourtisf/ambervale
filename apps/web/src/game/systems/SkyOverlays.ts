/**
 * Full-screen sky washes: the warm midday sun, the dusk and dawn gradients,
 * and the permanent vignette.
 *
 * These live on the HUD scene, whose camera never zooms. Putting them on the
 * world camera would scale them with the zoom — a scroll factor of 0 pins an
 * object's position but does not exempt it from the camera's zoom — leaving a
 * hard-edged rectangle floating in the middle of the viewport.
 */

import { DAY } from '@ambervale/game-config';
import * as Phaser from 'phaser';
import { makeRadialGradient, makeVerticalGradient, makeVignette } from './gradients';

export class SkyOverlays {
  private readonly scene: Phaser.Scene;
  private readonly duskWash: Phaser.GameObjects.Image;
  private readonly dawnWash: Phaser.GameObjects.Image;
  private readonly sun: Phaser.GameObjects.Image;
  private readonly vignette: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    makeVerticalGradient(scene, 'wash-dusk', [
      [0, 'rgba(255,138,76,0.0)'],
      [0.45, 'rgba(255,122,64,0.35)'],
      [1, 'rgba(120,48,96,0.55)'],
    ]);
    makeVerticalGradient(scene, 'wash-dawn', [
      [0, 'rgba(120,160,255,0.0)'],
      [0.5, 'rgba(255,190,150,0.30)'],
      [1, 'rgba(255,214,170,0.45)'],
    ]);
    // Faint, and drawn additively below. A translucent warm sheet in NORMAL
    // blend does not "light" the scene — it lays milk over it, flattening
    // contrast everywhere at once. Additive only ever brightens.
    makeRadialGradient(scene, 'sun-glow', [
      [0, 'rgba(255,238,196,0.55)'],
      [0.55, 'rgba(255,224,160,0.16)'],
      [1, 'rgba(255,214,150,0)'],
    ]);
    makeVignette(scene, 'vignette');

    const mk = (key: string, depth: number) =>
      scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth).setAlpha(0);

    this.sun = mk('sun-glow', 100).setBlendMode(Phaser.BlendModes.ADD);
    this.duskWash = mk('wash-dusk', 110);
    this.dawnWash = mk('wash-dawn', 111);
    this.vignette = mk('vignette', 120).setAlpha(1);

    this.resize();
    scene.scale.on('resize', this.resize, this);
  }

  private resize(): void {
    const { width, height } = this.scene.scale;
    for (const img of [this.duskWash, this.dawnWash, this.vignette]) {
      img.setPosition(0, 0).setDisplaySize(width, height);
    }
    // The sun is a square radial; oversize it so its transparent corners stay
    // outside the viewport at any aspect ratio.
    const d = Math.max(width, height) * 1.8;
    this.sun.setPosition((width - d) / 2, (height - d) / 2).setDisplaySize(d, d);
  }

  /** @param u cycle position, @param nightAmount 0 by day → 1 at full night. */
  update(u: number, nightAmount: number): void {
    const duskT =
      u >= DAY.dayEnd && u < DAY.duskEnd ? (u - DAY.dayEnd) / (DAY.duskEnd - DAY.dayEnd) : -1;
    const dawnT = u >= DAY.nightEnd ? (u - DAY.nightEnd) / (1 - DAY.nightEnd) : -1;

    this.duskWash.setAlpha(duskT < 0 ? 0 : Math.sin(duskT * Math.PI) * 0.85);
    this.dawnWash.setAlpha(dawnT < 0 ? 0 : Math.sin(dawnT * Math.PI) * 0.8);

    // Warm sun radial, strongest at midday and gone by dusk. Kept deliberately
    // subtle: this is a hint of sunlight pooling, not a filter over the world.
    const dayT = 1 - nightAmount;
    const arc = Math.sin(Math.min(1, Math.max(0, u / DAY.dayEnd)) * Math.PI);
    this.sun.setAlpha(dayT * (0.1 + 0.16 * arc));
  }

  destroy(): void {
    this.scene.scale.off('resize', this.resize, this);
    for (const img of [this.sun, this.duskWash, this.dawnWash, this.vignette]) img.destroy();
  }
}
