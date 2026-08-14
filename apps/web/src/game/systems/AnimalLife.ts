/**
 * Chicken and cow behaviour.
 *
 * Entirely cosmetic. The hens wander, peck and hop; the cow ambles and swishes
 * her tail; a speech bubble appears when she has milk. None of it decides
 * anything — whether an egg exists, or whether the cow can be milked, is
 * server state that this only reacts to.
 *
 * Positions are local and never sent anywhere, so the wander can be as loose
 * as it likes without any risk to the simulation.
 */

import { ANIMALS, PADDOCKS, TILE } from '@ambervale/game-config';
import type Phaser from 'phaser';
import { audio } from '@/lib/audio';
import { SPRITE_SCALE } from '../world/textures';

interface Wanderer {
  sprite: Phaser.GameObjects.Image;
  kind: 'chicken' | 'cow';
  home: { x: number; y: number; w: number; h: number };
  targetX: number;
  targetY: number;
  /** Seconds until the next decision (move, peck, idle). */
  timer: number;
  pecking: number;
  baseY: number;
}

const CHICKEN_SPEED = 26;
const COW_SPEED = 12;

export class AnimalLife {
  private readonly scene: Phaser.Scene;
  private readonly wanderers = new Map<number, Wanderer>();
  private milkBubble?: Phaser.GameObjects.Container;
  private elapsed = 0;
  private paused = false;
  private lastCluck = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = (): void => {
    this.paused = document.hidden;
  };

  /** Rectangle (in pixels) an animal of this kind roams. */
  private paddockFor(kind: 'chicken' | 'cow') {
    const p = kind === 'cow' ? PADDOCKS.cow : PADDOCKS.coop;
    return { x: p.x * TILE, y: p.y * TILE, w: p.w * TILE, h: p.h * TILE };
  }

  /** Creates sprites the first time the server tells us an animal exists. */
  ensure(index: number, kind: 'chicken' | 'cow'): void {
    if (this.wanderers.has(index)) return;

    const home = this.paddockFor(kind);
    const x = home.x + Math.random() * home.w;
    const y = home.y + Math.random() * home.h;

    const sprite = this.scene.add
      .image(x, y, kind)
      .setOrigin(0.5, 1)
      .setScale(SPRITE_SCALE)
      .setDepth(y)
      .setPipeline('Light2D');

    this.wanderers.set(index, {
      sprite,
      kind,
      home,
      targetX: x,
      targetY: y,
      timer: Math.random() * 3,
      pecking: 0,
      baseY: y,
    });
  }

  /** Plays the little hop a hen does when she lays. */
  layHop(index: number): void {
    const w = this.wanderers.get(index);
    if (!w) return;
    audio.cluck();
    this.scene.tweens.add({
      targets: w.sprite,
      y: w.baseY - 14,
      duration: 160,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Shows or hides the cow's milk bubble. */
  setMilkReady(ready: boolean): void {
    const cow = this.wanderers.get(ANIMALS.chicken.count);
    if (!cow) return;

    if (!ready) {
      this.milkBubble?.destroy();
      this.milkBubble = undefined;
      return;
    }
    if (this.milkBubble) return;

    const bubble = this.scene.add.circle(0, 0, 15, 0xfdf6e3, 0.95);
    bubble.setStrokeStyle(2, 0x0a2e3d, 0.35);
    const drop = this.scene.add.ellipse(0, 0, 11, 15, 0xffffff);
    drop.setStrokeStyle(1.5, 0x9ec6d8, 1);

    this.milkBubble = this.scene.add.container(cow.sprite.x, cow.sprite.y - 58, [bubble, drop]);
    this.milkBubble.setDepth(9000);
  }

  update(deltaMs: number): void {
    if (this.paused) return;
    const dt = deltaMs / 1000;
    this.elapsed += deltaMs;

    for (const w of this.wanderers.values()) {
      w.timer -= dt;

      if (w.pecking > 0) {
        w.pecking -= dt;
        // A peck is a quick nose-down tilt rather than a new animation frame.
        w.sprite.setAngle(Math.sin(this.elapsed / 60) * 9);
        continue;
      }
      w.sprite.setAngle(0);

      if (w.timer <= 0) {
        const roll = Math.random();
        if (w.kind === 'chicken' && roll < 0.4) {
          w.pecking = 0.6 + Math.random() * 0.8;
          w.timer = w.pecking + 0.4;
          // Sparse clucking, and never two at once.
          if (this.elapsed - this.lastCluck > 4000 && Math.random() < 0.3) {
            this.lastCluck = this.elapsed;
            audio.cluck();
          }
        } else {
          w.targetX = w.home.x + Math.random() * w.home.w;
          w.targetY = w.home.y + Math.random() * w.home.h;
          w.timer = 1.5 + Math.random() * 3;
        }
      }

      const dx = w.targetX - w.sprite.x;
      const dy = w.targetY - w.baseY;
      const dist = Math.hypot(dx, dy);

      if (dist > 3) {
        const speed = w.kind === 'cow' ? COW_SPEED : CHICKEN_SPEED;
        const step = Math.min(dist, speed * dt);
        w.sprite.x += (dx / dist) * step;
        w.baseY += (dy / dist) * step;
        w.sprite.setFlipX(dx < 0);

        // Chickens bob as they trot; the cow just plods.
        const bob = w.kind === 'chicken' ? Math.abs(Math.sin(this.elapsed / 90)) * 2 : 0;
        w.sprite.y = w.baseY - bob;
      } else {
        w.sprite.y = w.baseY;
      }

      w.sprite.setDepth(w.baseY);
    }

    // Keep the bubble over the cow's head and bob it gently.
    const cow = this.wanderers.get(ANIMALS.chicken.count);
    if (this.milkBubble && cow) {
      this.milkBubble.setPosition(cow.sprite.x, cow.baseY - 58 + Math.sin(this.elapsed / 320) * 4);
    }
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const w of this.wanderers.values()) w.sprite.destroy();
    this.wanderers.clear();
    this.milkBubble?.destroy();
  }
}
