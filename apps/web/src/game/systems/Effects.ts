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

  /**
   * Seeds thrown from the hand into the ground.
   *
   * They arc rather than travel straight, land at slightly different times,
   * and kick a little earth where they hit — sown, not spawned.
   */
  sow(fromX: number, fromY: number, toX: number, toY: number): void {
    for (let i = 0; i < 7; i++) {
      const spread = (Math.random() - 0.5) * 34;
      const landX = toX + spread;
      const landY = toY + (Math.random() - 0.5) * 14;

      const seed = this.scene.add
        .ellipse(fromX, fromY, 4, 3, 0xd9b779)
        .setDepth(9000)
        .setAngle(Math.random() * 180);

      // Two hops: up and over, then down onto the soil. A straight tween reads
      // as a laser; the apex is what makes it a throw.
      this.scene.tweens.chain({
        targets: seed,
        delay: i * 26,
        tweens: [
          {
            x: (fromX + landX) / 2,
            y: Math.min(fromY, landY) - 22,
            duration: 170,
            ease: 'Quad.easeOut',
          },
          { x: landX, y: landY, duration: 150, ease: 'Quad.easeIn' },
        ],
        onComplete: () => {
          this.dust(landX, landY, 0x8a663e);
          this.scene.tweens.add({
            targets: seed,
            alpha: 0,
            duration: 220,
            onComplete: () => seed.destroy(),
          });
        },
      });
    }
  }

  /**
   * Water poured from a spout onto a point, for as long as the pour lasts.
   *
   * Droplets are emitted over time rather than all at once, so it reads as a
   * stream being held over the ground rather than a splash that already
   * happened. The dark patch left behind is what makes the verb feel like it
   * did something to the world.
   */
  water(fromX: number, fromY: number, toX: number, toY: number, ms = 620): void {
    const drops = Math.round(ms / 32);

    for (let i = 0; i < drops; i++) {
      const jitterX = (Math.random() - 0.5) * 22;
      const landX = toX + jitterX;
      const landY = toY + (Math.random() - 0.5) * 12;

      const drop = this.scene.add
        .ellipse(fromX + (Math.random() - 0.5) * 4, fromY, 3, 7, 0x6fc3e8, 0.95)
        .setDepth(9000);

      this.scene.tweens.add({
        targets: drop,
        delay: i * 30,
        x: landX,
        y: landY,
        duration: 210,
        ease: 'Quad.easeIn',
        onComplete: () => {
          drop.destroy();
          // A splash: two small chips flicking sideways off the soil.
          for (let k = 0; k < 2; k++) {
            const chip = this.scene.add.circle(landX, landY, 1.8, 0x9fe8ff, 0.9).setDepth(8950);
            this.scene.tweens.add({
              targets: chip,
              x: landX + (k === 0 ? -1 : 1) * (6 + Math.random() * 8),
              y: landY - 5 - Math.random() * 5,
              alpha: 0,
              duration: 260,
              ease: 'Quad.easeOut',
              onComplete: () => chip.destroy(),
            });
          }
        },
      });
    }

    // The ground darkens under the pour and stays dark for a moment after it,
    // handing over to the wet soil texture the farm view swaps in.
    const patch = this.scene.add.ellipse(toX, toY, 44, 30, 0x1f2c1a, 0).setDepth(8700);
    this.scene.tweens.add({
      targets: patch,
      fillAlpha: 0.32,
      duration: ms * 0.6,
      yoyo: true,
      hold: 260,
      onComplete: () => patch.destroy(),
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
