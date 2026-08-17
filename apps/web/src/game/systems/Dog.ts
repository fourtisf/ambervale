/**
 * The farm dog.
 *
 * Entirely cosmetic, like the hens: she follows the farmer, sits when they
 * stand still, and runs to bark at crows — but shooing is still the player's
 * verb and the server's decision. She points at trouble; she never fixes it.
 * The game had animals that produce and buildings that do nothing, but not a
 * single thing in it that cares where the player is. That is the whole job.
 */

import { PLAYER, TILE, plotAt, structureAt } from '@ambervale/game-config';
import type Phaser from 'phaser';
import { bridge } from '../bridge';
import { audio } from '@/lib/audio';
import { SPRITE_SCALE } from '../world/textures';
import type { Collision } from '../world/tilemap';

/** Close enough; she stops here rather than standing in the farmer's boots. */
const HEEL_PX = 62;
/** Beyond this she gives up trotting and simply reappears at heel — a dog
 *  lost behind a barn forever is worse than a small teleport nobody sees. */
const LOST_PX = 460;
/** Crows further than this from the farmer are not her problem. */
const ALERT_PX = 320;
const TROT_SPEED = PLAYER.speed * 0.92;
const SPRINT_SPEED = PLAYER.speed * 1.35;
/** Standing still this long sits her down. */
const SIT_AFTER_S = 4;

export class Dog {
  private readonly scene: Phaser.Scene;
  private readonly collision: Collision;
  private readonly sprite: Phaser.GameObjects.Image;
  private elapsed = 0;
  private stillFor = 0;
  private sitting = false;
  private lastBark = -Infinity;
  private lastPlayer = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, collision: Collision) {
    this.scene = scene;
    this.collision = collision;

    // She starts on the porch, where a farm dog starts.
    const house = structureAt('house');
    const x = (house.x + 1.6) * TILE;
    const y = (house.y + 0.4) * TILE;
    this.sprite = scene.add
      .image(x, y, 'dog')
      .setOrigin(0.5, 1)
      .setScale(SPRITE_SCALE)
      .setDepth(y)
      .setPipeline('Light2D')
      .setVisible(false);
  }

  /** Moves her instantly — used when the farmer crosses water she cannot. */
  place(x: number, y: number): void {
    this.sprite.setPosition(x, y).setDepth(y);
  }

  /** Nearest crow worth barking at, in pixels, or null. */
  private crowTarget(px: number, py: number): { x: number; y: number } | null {
    const farm = bridge.farm;
    if (!farm) return null;

    let best: { x: number; y: number } | null = null;
    let bestDist = ALERT_PX;
    for (const plot of farm.plots) {
      if (!plot.crow) continue;
      const slot = plotAt(plot.index);
      if (!slot) continue;
      const x = slot.x * TILE + TILE / 2;
      const y = slot.y * TILE + TILE / 2;
      const d = Math.hypot(x - px, y - py);
      if (d < bestDist) {
        bestDist = d;
        best = { x, y: y + TILE * 0.7 };
      }
    }
    return best;
  }

  update(deltaMs: number, px: number, py: number): void {
    if (!bridge.started) return;
    if (!this.sprite.visible) this.sprite.setVisible(true);

    const dt = deltaMs / 1000;
    this.elapsed += deltaMs;

    const playerMoved = Math.hypot(px - this.lastPlayer.x, py - this.lastPlayer.y) > 1.5;
    this.lastPlayer = { x: px, y: py };
    this.stillFor = playerMoved ? 0 : this.stillFor + dt;

    const crow = this.crowTarget(px, py);
    const target = crow ?? { x: px, y: py };
    const stopAt = crow ? 10 : HEEL_PX;

    const dx = target.x - this.sprite.x;
    const dy = target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    if (!crow && dist > LOST_PX) {
      // Reappear at heel rather than pathfind — see LOST_PX.
      this.place(px + 30, py + 20);
      return;
    }

    if (dist > stopAt) {
      if (this.sitting) {
        this.sitting = false;
        this.sprite.setTexture('dog');
      }

      const speed = dist > 200 || crow ? SPRINT_SPEED : TROT_SPEED;
      const step = Math.min(dist - stopAt + 1, speed * dt);
      const nx = this.sprite.x + (dx / dist) * step;
      const ny = this.sprite.y + (dy / dist) * step;

      // She will not step into the lake; she waits at the shore instead.
      if (!this.collision.blocked(nx, ny)) {
        this.sprite.setPosition(nx, ny);
      } else if (!this.collision.blocked(nx, this.sprite.y)) {
        this.sprite.setX(nx);
      } else if (!this.collision.blocked(this.sprite.x, ny)) {
        this.sprite.setY(ny);
      }

      this.sprite.setFlipX(dx < 0);
      // A trotting bounce, quicker when she is sprinting.
      const bob = Math.abs(Math.sin(this.elapsed / (speed > TROT_SPEED ? 70 : 95))) * 3;
      this.sprite.setOrigin(0.5, 1 + bob / this.sprite.height);
    } else if (crow) {
      // Stationed at the crow: hop and bark until somebody deals with it.
      this.sprite.setFlipX(crow.x < this.sprite.x - 4);
      const hop = Math.abs(Math.sin(this.elapsed / 160)) * 5;
      this.sprite.setOrigin(0.5, 1 + hop / this.sprite.height);
      if (this.elapsed - this.lastBark > 5200) {
        this.lastBark = this.elapsed;
        audio.bark();
      }
    } else {
      this.sprite.setOrigin(0.5, 1);
      const shouldSit = this.stillFor > SIT_AFTER_S;
      if (shouldSit !== this.sitting) {
        this.sitting = shouldSit;
        this.sprite.setTexture(shouldSit ? 'dogSit' : 'dog');
        // Face the farmer when she settles.
        if (shouldSit) this.sprite.setFlipX(px < this.sprite.x);
      }
    }

    this.sprite.setDepth(this.sprite.y);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
