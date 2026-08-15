/**
 * Feedback: floating text, particle bursts and items flying to the HUD.
 *
 * Purely cosmetic. Nothing here decides anything — it reacts to what the
 * server already confirmed, so a failed action simply never plays.
 */

import * as Phaser from 'phaser';

export class Effects {
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** A number or word that rises and fades above a point. */
  float(x: number, y: number, text: string, color = '#f5e6c8'): void {
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color,
        stroke: '#0a2e3d',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(9000);

    this.scene.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      duration: 950,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** A short-lived burst of coloured chips. */
  burst(x: number, y: number, color: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 40 + Math.random() * 70;
      const chip = this.scene.add
        .rectangle(x, y, 4 + Math.random() * 3, 4 + Math.random() * 3, color)
        .setDepth(8900);

      this.scene.tweens.add({
        targets: chip,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed - 14,
        alpha: 0,
        angle: Math.random() * 360,
        duration: 480 + Math.random() * 260,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  /** Dust kicked up by a tool hitting something solid. */
  dust(x: number, y: number, color = 0xb59468): void {
    for (let i = 0; i < 6; i++) {
      const puff = this.scene.add
        .circle(x + (Math.random() - 0.5) * 18, y, 3 + Math.random() * 4, color, 0.65)
        .setDepth(8800);
      this.scene.tweens.add({
        targets: puff,
        y: y - 18 - Math.random() * 14,
        alpha: 0,
        scale: 1.8,
        duration: 520,
        ease: 'Sine.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /**
   * An item arcs from the world toward the HUD.
   *
   * The HUD is a DOM overlay in the top-left, so the arc targets the camera's
   * top-left corner in world space rather than a screen coordinate.
   */
  flyToHud(x: number, y: number, color: number): void {
    const cam = this.scene.cameras.main;
    const targetX = cam.worldView.x + 40 / cam.zoom;
    const targetY = cam.worldView.y + 40 / cam.zoom;

    const chip = this.scene.add.circle(x, y, 7, color).setDepth(9100);
    chip.setStrokeStyle(2, 0xffffff, 0.6);

    this.scene.tweens.add({
      targets: chip,
      x: targetX,
      y: targetY,
      scale: 0.4,
      duration: 620,
      ease: 'Cubic.easeIn',
      onComplete: () => chip.destroy(),
    });
  }

  /** A ring that expands and fades — used for level-ups and completions. */
  pulse(x: number, y: number, color = 0xf4b942): void {
    const ring = this.scene.add.circle(x, y, 10).setDepth(9050);
    ring.setStrokeStyle(4, color, 1);
    this.scene.tweens.add({
      targets: ring,
      radius: 90,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.easeOut',
      onUpdate: () => ring.setStrokeStyle(4, color, ring.alpha),
      onComplete: () => ring.destroy(),
    });
  }
}

export const COLORS = {
  coin: 0xf4d35e,
  amber: 0xf4b942,
  xp: 0x9fe8ff,
  wood: 0x8b5a2b,
  stone: 0x8a8f98,
  leaf: 0x57a44c,
  water: 0x6fc3e8,
} as const;

export const blend = Phaser.BlendModes;
