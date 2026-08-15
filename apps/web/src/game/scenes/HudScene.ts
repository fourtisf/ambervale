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
import { bridge } from '../bridge';
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
  /** Edge-of-screen pointer to an off-camera tutorial objective. */
  private arrow!: Phaser.GameObjects.Triangle;
  private arrowLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'HudScene' });
  }

  create(data: HudSceneData): void {
    this.world = this.scene.get('WorldScene') as WorldScene;

    this.sky = new SkyOverlays(this);
    this.minimap = new Minimap(this, data.map);

    this.arrow = this.add
      .triangle(0, 0, 0, -13, 11, 9, -11, 9, 0xf4b942)
      .setDepth(190)
      .setVisible(false);
    this.arrowLabel = this.add
      .text(0, 0, 'Objective', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#0a2e3d',
        backgroundColor: '#f4b942',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(191)
      .setVisible(false);

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

    // The invite gate covers the world, and a minimap floating in the corner
    // of a code prompt reads as a stray artefact rather than as the game.
    // Read the mirrored flag rather than only subscribing: this scene is
    // launched by WorldScene, so the gate is nearly always decided already.
    this.minimap.setVisible(!bridge.gated);
    const offGated = bridge.on('gated', (gated) => this.minimap.setVisible(!gated));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offGated();
      this.sky.destroy();
      this.minimap.destroy();
    });
  }

  /**
   * Points at the tutorial objective when it is off-camera.
   *
   * This lives on the HUD scene because it is a screen-space marker: on the
   * world camera it would be scaled by the zoom and drift away from the edge.
   */
  private updateObjectiveArrow(cam: Phaser.Cameras.Scene2D.Camera): void {
    const target = this.world.getObjective();
    if (!target || cam.worldView.contains(target.x, target.y)) {
      this.arrow.setVisible(false);
      this.arrowLabel.setVisible(false);
      return;
    }

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Direction from the viewport centre to the objective, in screen space.
    const dx = (target.x - cam.worldView.centerX) * cam.zoom;
    const dy = (target.y - cam.worldView.centerY) * cam.zoom;
    const angle = Math.atan2(dy, dx);

    const margin = 46;
    const rx = cx - margin;
    const ry = cy - margin;
    // Scale the direction out to whichever edge it hits first.
    const scale = Math.min(
      Math.abs(dx) > 0.001 ? rx / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.001 ? ry / Math.abs(dy) : Infinity,
    );

    const x = cx + dx * scale;
    const y = cy + dy * scale;

    this.arrow
      .setPosition(x, y)
      .setRotation(angle + Math.PI / 2)
      .setVisible(true);
    this.arrowLabel.setPosition(x, y + 24).setVisible(true);
  }

  override update(): void {
    const dayNight = this.world.getDayNight();
    if (!dayNight) return;

    this.sky.update(dayNight.u, dayNight.nightAmount);

    const cam = this.world.cameras.main;
    const focus = this.world.getFocusPoint();
    this.minimap.update(cam, focus.x, focus.y);
    this.updateObjectiveArrow(cam);

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
