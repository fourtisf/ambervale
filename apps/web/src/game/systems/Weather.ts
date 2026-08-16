/**
 * Today's sky, drawn.
 *
 * The economic half of the daily conditions is a number in a panel, and a
 * number in a panel is not a day. This is the half you can see out of the
 * window: rain falling across the field, mist lying on it, or the flat gold
 * light of a good drying day.
 *
 * Like SkyOverlays this lives on the HUD scene, whose camera never zooms —
 * rain drawn on the world camera would get bigger as the player zoomed in,
 * which is exactly backwards for something meant to be between the viewer and
 * the world. It sits *below* the dusk and dawn washes (depth 100–120) so
 * nightfall still colours the weather rather than the weather covering it.
 */

import { SKIES, type SkyKey } from '@ambervale/game-config';
import * as Phaser from 'phaser';
import { makeVerticalGradient } from './gradients';

/** Drops on screen at once during rain. */
const DROPS = 90;

interface Drop {
  line: Phaser.GameObjects.Line;
  speed: number;
  drift: number;
}

export class Weather {
  private readonly scene: Phaser.Scene;
  private sky: SkyKey = 'clear';

  private readonly drops: Drop[] = [];
  /** Two mist banks at different speeds, for parallax rather than one sheet. */
  private readonly mistNear: Phaser.GameObjects.Image;
  private readonly mistFar: Phaser.GameObjects.Image;
  private readonly gold: Phaser.GameObjects.Image;
  /** Grey wash that makes a rainy day read as overcast, not just streaky. */
  private readonly overcast: Phaser.GameObjects.Image;

  private mistX = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    makeVerticalGradient(scene, 'wash-overcast', [
      [0, 'rgba(96,116,132,0.34)'],
      [1, 'rgba(74,92,108,0.16)'],
    ]);
    makeVerticalGradient(scene, 'wash-gold', [
      [0, 'rgba(255,214,130,0.26)'],
      [1, 'rgba(255,186,96,0.10)'],
    ]);
    makeVerticalGradient(scene, 'wash-mist', [
      [0, 'rgba(226,236,240,0.00)'],
      [0.35, 'rgba(226,236,240,0.42)'],
      [0.75, 'rgba(214,228,236,0.30)'],
      [1, 'rgba(226,236,240,0.00)'],
    ]);

    const mk = (key: string, depth: number) =>
      scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth).setAlpha(0).setScrollFactor(0);

    this.overcast = mk('wash-overcast', 90);
    this.gold = mk('wash-gold', 91).setBlendMode(Phaser.BlendModes.ADD);
    this.mistFar = mk('wash-mist', 92);
    this.mistNear = mk('wash-mist', 93);

    for (let i = 0; i < DROPS; i++) {
      const line = scene.add
        .line(0, 0, 0, 0, 0, 0, 0xdfeaf2, 0.55)
        .setOrigin(0, 0)
        .setDepth(95)
        .setScrollFactor(0)
        .setVisible(false);
      this.drops.push({ line, speed: 0, drift: 0 });
    }

    this.resize();
    scene.scale.on('resize', this.resize, this);
  }

  private resize(): void {
    const { width, height } = this.scene.scale;
    for (const img of [this.overcast, this.gold]) {
      img.setPosition(0, 0).setDisplaySize(width, height);
    }
    // Mist banks are drawn double-width and slid sideways, so a band can leave
    // one edge while its copy is still covering the other.
    for (const img of [this.mistFar, this.mistNear]) img.setDisplaySize(width * 2, height);
    for (const drop of this.drops) this.placeDrop(drop, true);
  }

  /** Puts one drop somewhere plausible. `fresh` starts it above the screen. */
  private placeDrop(drop: Drop, fresh: boolean): void {
    const { width, height } = this.scene.scale;
    const len = 12 + Math.random() * 16;
    drop.speed = 950 + Math.random() * 650;
    drop.drift = -0.22 - Math.random() * 0.1;
    drop.line.setTo(0, 0, drop.drift * len, len);
    drop.line.setPosition(
      Math.random() * (width + 220) - 110,
      fresh ? Math.random() * height : -len - Math.random() * 120,
    );
    drop.line.setAlpha(0.3 + Math.random() * 0.35);
  }

  /** Called whenever a farm snapshot arrives; cheap to call repeatedly. */
  setSky(sky: SkyKey): void {
    if (!(sky in SKIES) || sky === this.sky) return;
    this.sky = sky;
    const raining = sky === 'rain';
    for (const drop of this.drops) {
      drop.line.setVisible(raining);
      if (raining) this.placeDrop(drop, true);
    }
  }

  update(deltaMs: number, nightAmount: number): void {
    const dt = deltaMs / 1000;
    const { width, height } = this.scene.scale;

    // Weather is daylight-dominant: at midnight the night wash is already
    // doing the work, and a full-strength grey sheet on top of it just makes
    // the screen muddy.
    const day = 1 - nightAmount * 0.65;

    this.overcast.setAlpha(this.sky === 'rain' ? 0.9 * day : 0);
    this.gold.setAlpha(this.sky === 'golden' ? 0.85 * day : 0);

    if (this.sky === 'mist') {
      this.mistX = (this.mistX + dt * 14) % width;
      this.mistFar.setPosition(-this.mistX, height * 0.12).setAlpha(0.75 * day);
      this.mistNear
        .setPosition(-((this.mistX * 2.1) % width) - width * 0.5, height * 0.34)
        .setAlpha(0.6 * day);
    } else {
      this.mistFar.setAlpha(0);
      this.mistNear.setAlpha(0);
    }

    if (this.sky !== 'rain') return;
    for (const drop of this.drops) {
      const line = drop.line;
      line.y += drop.speed * dt;
      line.x += drop.speed * drop.drift * dt;
      if (line.y > height + 40 || line.x < -140) this.placeDrop(drop, false);
    }
  }

  destroy(): void {
    this.scene.scale.off('resize', this.resize, this);
    for (const drop of this.drops) drop.line.destroy();
    for (const img of [this.overcast, this.gold, this.mistFar, this.mistNear]) img.destroy();
  }
}
