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
  /** Her name, floating just over her head once the player gives her one. */
  private readonly label: Phaser.GameObjects.Text;
  private elapsed = 0;
  private stillFor = 0;
  private sitting = false;
  private lastBark = -Infinity;
  private lastPlayer = { x: 0, y: 0 };
  private readonly offPet: () => void;

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

    this.label = scene.add
      .text(x, y, '', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f5e6c8',
        stroke: '#0a2e3d',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(9000)
      .setVisible(false);

    this.offPet = bridge.on('petDog', () => this.pet());

    // Clicking her is the front door to both verbs. The E-key path and the
    // Settings row still exist, but "click the dog to name the dog" is the
    // only version of the instruction nobody needs told.
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () => {
      if (!bridge.started || bridge.openModal || bridge.spectator || bridge.sailing) return;
      if (bridge.farm?.user.dogName) {
        audio.bark();
        this.pet();
      } else {
        bridge.emit('modal', 'dogname');
      }
    });
  }

  /** The happy hop a pat earns: a bounce, a tail-wag wiggle, and a yip. */
  private pet(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.sprite.y - 14,
      duration: 150,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -6, to: 6 },
      duration: 90,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  /** Moves her instantly — used when the farmer crosses water she cannot. */
  place(x: number, y: number): void {
    this.sprite.setPosition(x, y).setDepth(y);
  }

  /** Nearest crow worth barking at, in pixels, or null. */
  private crowTarget(px: number, py: number): { x: number; y: number } | null {
    const farm = bridge.farm;
    if (!farm) return null;
    // Not on a visit: the crows are the owner's problem, nobody here can
    // shoo them, and a dog barking at a fixed point forever is a broken toy.
    if (bridge.spectator) return null;

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

  /** One nudge per session toward the name, and only while she has none. */
  private hinted = false;

  update(deltaMs: number, px: number, py: number): void {
    if (!bridge.started) return;
    if (!this.sprite.visible) {
      this.sprite.setVisible(true);
      if (!this.hinted && !bridge.spectator && !bridge.farm?.user.dogName) {
        this.hinted = true;
        this.scene.time.delayedCall(12_000, () => {
          if (!bridge.farm?.user.dogName && bridge.started && !bridge.spectator) {
            bridge.toast('info', 'The dog needs a name — click her, or find her in Settings.');
          }
        });
      }
    }

    const dt = deltaMs / 1000;
    this.elapsed += deltaMs;

    const playerMoved = Math.hypot(px - this.lastPlayer.x, py - this.lastPlayer.y) > 1.5;
    this.lastPlayer = { x: px, y: py };
    this.stillFor = playerMoved ? 0 : this.stillFor + dt;

    // Aboard. When the farmer takes the helm she rides the bow — a dog does
    // not wait on the dock while her person sails away. No wandering, no
    // crow-chasing, no sitting: paws on the rail until they step ashore.
    if (bridge.sailing && bridge.boatAt) {
      const b = bridge.boatAt;
      if (this.sitting) {
        this.sitting = false;
        this.sprite.setTexture('dog');
      }
      this.sprite.setOrigin(0.5, 1);
      this.sprite.setPosition(b.x + 38, b.y - 16 + Math.sin(this.elapsed / 380) * 2);
      this.sprite.setDepth(b.y + 2);
      this.syncOverhead();
      return;
    }

    const crow = this.crowTarget(px, py);
    const target = crow ?? { x: px, y: py };
    const stopAt = crow ? 10 : HEEL_PX;

    const dx = target.x - this.sprite.x;
    const dy = target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);

    if (!crow && dist > LOST_PX) {
      // Reappear at heel rather than pathfind — see LOST_PX. Unless heel is
      // water: while the farmer is mid-crossing she waits on the shore, and
      // the landing places her properly when the boat arrives.
      if (!this.collision.blocked(px + 30, py + 20)) {
        this.place(px + 30, py + 20);
      }
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
    this.syncOverhead();
  }

  /** Mirror for the interaction scan, and keep her name over her head. */
  private syncOverhead(): void {
    bridge.dogAt = { x: this.sprite.x, y: this.sprite.y };
    const name = bridge.farm?.user.dogName ?? null;
    if (name) {
      if (this.label.text !== name) this.label.setText(name);
      this.label.setPosition(this.sprite.x, this.sprite.y - this.sprite.displayHeight - 4);
      if (!this.label.visible) this.label.setVisible(true);
    } else if (this.label.visible) {
      this.label.setVisible(false);
    }
  }

  destroy(): void {
    this.offPet();
    this.sprite.destroy();
    this.label.destroy();
    bridge.dogAt = null;
  }
}
