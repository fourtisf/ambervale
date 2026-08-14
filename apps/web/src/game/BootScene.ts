import { TILE, WORLD } from '@ambervale/game-config';
import * as Phaser from 'phaser';

export const BACKGROUND_COLOR = '#0a2e3d';

/**
 * Phase 0 placeholder scene: a solid field of the AMBERVALE deep-teal and an
 * FPS counter, sized to the viewport. Everything real — terrain baking, the
 * static layout, day/night lighting — lands in Phase 1.
 */
export class BootScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'BootScene' });
  }

  // `create` is an optional lifecycle hook rather than a declared base member,
  // so it takes no `override` modifier — unlike `update`.
  create(): void {
    this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

    this.fpsText = this.add
      .text(12, 10, 'FPS —', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '14px',
        color: '#f4b942',
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.infoText = this.add
      .text(12, 30, `world ${WORLD.w}×${WORLD.h} tiles @ ${TILE}px`, {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        color: '#f5e6c8',
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setAlpha(0.6);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.resize(gameSize.width, gameSize.height);
  }

  override update(): void {
    // actualFps is already smoothed by Phaser's loop; rounding is enough.
    this.fpsText.setText(`FPS ${Math.round(this.game.loop.actualFps)}`);
    this.infoText.setText(
      `world ${WORLD.w}×${WORLD.h} tiles @ ${TILE}px · ${this.scale.width}×${this.scale.height}`,
    );
  }
}
