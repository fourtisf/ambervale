/**
 * Fades tall scenery that stands between the camera and the player.
 *
 * Everything in the world is y-sorted, so a pine, an oak or a barn whose base
 * is north of the player is drawn over them — correctly, but a full-height
 * canopy swallows the character entirely. From the player's side that is
 * indistinguishable from being stuck: the joystick works, the sprite moves,
 * and nothing on screen changes. Rather than reorder the world, whatever is
 * currently covering the player is dimmed until they step clear.
 *
 * Base alpha is read through a callback rather than captured, because some
 * sprites own their own opacity — a depleted node sits at 0.85 — and the fade
 * has to multiply into that instead of overwriting it.
 */

import type Phaser from 'phaser';

/** Opacity multiplier applied to a sprite that is covering the player. */
const FADE_TO = 0.32;

/** Fade speed in alpha units per second; a blink would be worse than the bug. */
const FADE_RATE = 5.5;

/** Only sprites this close on x can possibly cover the player. */
const X_RANGE = 110;

interface Occluder {
  img: Phaser.GameObjects.Image;
  base: () => number;
  /** Current multiplier, eased toward FADE_TO or 1. */
  factor: number;
}

export class Occlusion {
  private readonly items: Occluder[] = [];
  private readonly scratch: Phaser.Geom.Rectangle;

  constructor(scratch: Phaser.Geom.Rectangle) {
    this.scratch = scratch;
  }

  /** Adds a sprite that may cover the player. Safe to call more than once. */
  register(img: Phaser.GameObjects.Image, base: () => number = () => 1): void {
    if (this.items.some((it) => it.img === img)) return;
    this.items.push({ img, base, factor: 1 });
  }

  registerAll(imgs: Phaser.GameObjects.Image[]): void {
    for (const img of imgs) this.register(img);
  }

  /**
   * @param px player's x
   * @param py player's feet y, which is also the player's depth
   */
  update(px: number, py: number, deltaMs: number): void {
    const stepAmount = (FADE_RATE * deltaMs) / 1000;
    // Two samples: the chest, and just above the feet. One point alone lets a
    // narrow trunk slip between checks on a tall sprite.
    const chestY = py - 26;
    const shinY = py - 6;

    for (const it of this.items) {
      const img = it.img;
      let covering = false;

      if (img.visible && img.depth >= py && Math.abs(img.x - px) < X_RANGE) {
        const b = img.getBounds(this.scratch);
        covering = b.contains(px, chestY) || b.contains(px, shinY);
      }

      const goal = covering ? FADE_TO : 1;
      if (it.factor !== goal) {
        const delta = goal - it.factor;
        it.factor =
          Math.abs(delta) <= stepAmount ? goal : it.factor + Math.sign(delta) * stepAmount;
      }

      const alpha = it.base() * it.factor;
      if (img.alpha !== alpha) img.setAlpha(alpha);
    }
  }

  destroy(): void {
    this.items.length = 0;
  }
}
