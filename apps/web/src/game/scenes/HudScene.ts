/**
 * HUD scene — runs in parallel with WorldScene, on top of it.
 *
 * Its camera never zooms or scrolls, so anything drawn here is in real screen
 * pixels. That is the whole reason it exists: a scroll-locked object on the
 * world camera is still scaled by that camera's zoom.
 *
 * Only canvas-native HUD belongs here (sky washes, minimap, debug readout).
 * Panels, modals and buttons are React/DOM from Phase 3 on.
 */

import * as Phaser from 'phaser';
import { Minimap } from '../systems/Minimap';
import { SkyOverlays } from '../systems/SkyOverlays';
import type { WorldMap } from '../world/tilemap';
import type { WorldScene } from './WorldScene';

export interface HudSceneData {
  map: WorldMap;
}

export class HudScene extends Phaser.Scene {
  private sky!: SkyOverlays;
  private minimap!: Minimap;
  private debugText?: Phaser.GameObjects.Text;
  private world!: WorldScene;

  constructor() {
    super({ key: 'HudScene' });
  }

  create(data: HudSceneData): void {
    this.world = this.scene.get('WorldScene') as WorldScene;

    this.sky = new SkyOverlays(this);
    this.minimap = new Minimap(this, data.map);

    const debug =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
    if (debug) {
      this.debugText = this.add
        .text(12, 10, '', {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '12px',
          color: '#f5e6c8',
          backgroundColor: 'rgba(10,46,61,0.55)',
          padding: { x: 6, y: 4 },
        })
        .setDepth(200);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.sky.destroy();
      this.minimap.destroy();
    });
  }

  override update(): void {
    const dayNight = this.world.getDayNight();
    if (!dayNight) return;

    this.sky.update(dayNight.u, dayNight.nightAmount);

    const cam = this.world.cameras.main;
    const focus = this.world.getFocusPoint();
    this.minimap.update(cam, focus.x, focus.y);

    if (this.debugText) {
      this.debugText.setText(
        [
          `FPS ${Math.round(this.game.loop.actualFps)}`,
          `${dayNight.phase}  u=${dayNight.u.toFixed(3)}  night=${dayNight.nightAmount.toFixed(2)}`,
          `bake ${this.world.getBakeMs().toFixed(0)}ms  zoom ${cam.zoom.toFixed(3)}`,
          'debug camera: WASD',
        ].join('\n'),
      );
    }
  }
}
