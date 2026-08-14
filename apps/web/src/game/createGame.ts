import * as Phaser from 'phaser';
import { BACKGROUND_COLOR, BootScene } from './BootScene';

/**
 * Builds the Phaser game instance. Kept separate from the React mount so the
 * scene list and renderer settings stay in one place as phases add scenes.
 */
export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: BACKGROUND_COLOR,
    // Crisp vector-ish art, not a pixel-art game: no nearest-neighbour scaling,
    // but snap sprites to whole pixels to stop shimmer while the camera pans.
    render: {
      pixelArt: false,
      roundPixels: true,
      antialias: true,
      powerPreference: 'high-performance',
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    // Capped so a 120Hz phone doesn't burn battery running the loop twice as
    // often as the simulation needs.
    fps: { target: 60, limit: 60 },
    autoFocus: true,
    disableContextMenu: true,
    scene: [BootScene],
  });
}
