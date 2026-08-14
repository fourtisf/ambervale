/**
 * Player movement.
 *
 * Movement is client-side and unauthoritative — the server never validates a
 * position, because position cannot mint anything. What the server does check
 * is every action taken from that position, so walking through a wall would
 * gain a cheat nothing but a bad view.
 *
 * Three input sources feed one velocity: the virtual joystick, WASD, and
 * tap-to-walk. Whichever moved last wins.
 */

import { JOYSTICK, PLAYER, TILE } from '@ambervale/game-config';
import type Phaser from 'phaser';
import { bridge } from '../bridge';
import type { Collision } from '../world/tilemap';

/** How close to a tap target counts as arrived. */
const ARRIVE_EPSILON = 8;

/** Radius of the player's body for collision, in pixels. */
const BODY_RADIUS = 13;

export class PlayerController {
  readonly sprite: Phaser.GameObjects.Image;

  private readonly scene: Phaser.Scene;
  private readonly collision: Collision;
  private keys?: Record<
    'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT',
    Phaser.Input.Keyboard.Key
  >;

  private walkTarget: { x: number; y: number } | null = null;
  private ripple?: Phaser.GameObjects.Arc;
  private bobPhase = 0;
  private baseY = 0;
  /** Light that follows the player so they stay readable at night. */
  private light?: Phaser.GameObjects.Light;

  constructor(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Image,
    collision: Collision,
    light?: Phaser.GameObjects.Light,
  ) {
    this.scene = scene;
    this.sprite = sprite;
    this.collision = collision;
    this.light = light;
    this.baseY = sprite.y;

    if (scene.input.keyboard) {
      this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as typeof this.keys;
    }

    // Tap-to-walk. Pointer events on the canvas; the joystick lives in the DOM
    // and stops propagation, so a thumb on the stick never also taps the world.
    scene.input.on('pointerdown', this.onPointerDown, this);
    bridge.on('walkTo', (p) => this.setWalkTarget(p.x, p.y));
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!bridge.started || bridge.openModal) return;
    this.setWalkTarget(pointer.worldX, pointer.worldY);
  }

  private setWalkTarget(x: number, y: number): void {
    this.walkTarget = { x, y };
    this.showRipple(x, y);
  }

  private showRipple(x: number, y: number): void {
    this.ripple?.destroy();
    const ring = this.scene.add.circle(x, y, 6, 0xf4b942, 0).setDepth(y - 1);
    ring.setStrokeStyle(2.5, 0xf5e6c8, 0.9);
    this.ripple = ring;

    this.scene.tweens.add({
      targets: ring,
      radius: 26,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeOut',
      onUpdate: () => ring.setStrokeStyle(2.5, 0xf5e6c8, ring.alpha),
      onComplete: () => {
        ring.destroy();
        if (this.ripple === ring) this.ripple = undefined;
      },
    });
  }

  /** Current position, for interaction range checks. */
  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.baseY;
  }

  update(deltaMs: number): void {
    if (!bridge.started) return;

    const dt = deltaMs / 1000;
    let vx = 0;
    let vy = 0;

    // 1. joystick
    const { moveX, moveY } = bridge.input;
    if (moveX !== 0 || moveY !== 0) {
      vx = moveX;
      vy = moveY;
      this.walkTarget = null;
    }

    // 2. keyboard overrides the stick
    const k = this.keys;
    if (k && !bridge.openModal) {
      let kx = 0;
      let ky = 0;
      if (k.A.isDown || k.LEFT.isDown) kx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) kx += 1;
      if (k.W.isDown || k.UP.isDown) ky -= 1;
      if (k.S.isDown || k.DOWN.isDown) ky += 1;
      if (kx !== 0 || ky !== 0) {
        vx = kx;
        vy = ky;
        this.walkTarget = null;
      }
    }

    // 3. tap-to-walk, if nothing else is driving
    if (vx === 0 && vy === 0 && this.walkTarget) {
      const dx = this.walkTarget.x - this.sprite.x;
      const dy = this.walkTarget.y - this.baseY;
      const dist = Math.hypot(dx, dy);
      if (dist <= ARRIVE_EPSILON) {
        this.walkTarget = null;
      } else {
        vx = dx / dist;
        vy = dy / dist;
      }
    }

    const magnitude = Math.hypot(vx, vy);
    if (magnitude > 0) {
      // Normalise so diagonals are not faster, then apply the joystick's
      // minimum speed so a barely-nudged stick still walks rather than crawls.
      const scale = Math.min(1, magnitude);
      const speedScale = Math.max(JOYSTICK.minSpeedScale, scale);
      const step = PLAYER.speed * speedScale * dt;

      const nx = (vx / magnitude) * step;
      const ny = (vy / magnitude) * step;

      // Axis-separated so a diagonal into a wall slides along it instead of
      // sticking. Sampling at the body edge, not the centre, keeps the sprite
      // from visually overlapping the obstacle.
      this.tryMove(nx, 0);
      this.tryMove(0, ny);

      if (nx !== 0) this.sprite.setFlipX(nx < 0);
      this.bobPhase += deltaMs / 90;
    } else {
      this.bobPhase = 0;
    }

    // Walk bob: a small vertical hop, applied on top of the true position.
    const bob = this.bobPhase > 0 ? Math.abs(Math.sin(this.bobPhase)) * 3 : 0;
    this.sprite.y = this.baseY - bob;
    this.sprite.setDepth(this.baseY);

    this.light?.setPosition(this.sprite.x, this.baseY - 16);
  }

  private tryMove(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;

    const nx = this.sprite.x + dx;
    const ny = this.baseY + dy;

    // Probe the leading edge of the body rather than its centre.
    const probeX = nx + Math.sign(dx) * BODY_RADIUS;
    const probeY = ny + Math.sign(dy) * (BODY_RADIUS * 0.5);

    if (this.collision.blocked(dx !== 0 ? probeX : nx, dy !== 0 ? probeY : ny - 2)) return;

    this.sprite.x = nx;
    this.baseY = ny;
  }

  /** Distance from the player's feet to a world point. */
  distanceTo(x: number, y: number): number {
    return Math.hypot(this.sprite.x - x, this.baseY - y);
  }

  /** Plays a tool swing: a quick lean and snap back. */
  swing(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setAngle(0);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: this.sprite.flipX ? 22 : -22,
      duration: 110,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  /** Teleport-free repositioning used by the tutorial's Guide me. */
  walkTo(x: number, y: number): void {
    this.setWalkTarget(x, y);
  }

  get tilePosition(): { tx: number; ty: number } {
    return { tx: Math.floor(this.sprite.x / TILE), ty: Math.floor(this.baseY / TILE) };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.ripple?.destroy();
  }
}
