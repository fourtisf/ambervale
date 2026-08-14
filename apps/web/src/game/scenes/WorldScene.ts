/**
 * The world scene.
 *
 * Phase 1 scope: generate and render AMBERVALE, run the day/night cycle, the
 * ambient life and the cinematic title camera. There is no player character
 * and no server yet — those arrive in Phase 2 — so the only input is a
 * free-fly debug camera behind ?debug=1.
 *
 * Screen-space HUD lives in HudScene, launched alongside this one.
 */

import { NODE_SLOTS, SPAWN, TILE, WORLD, baseZoom } from '@ambervale/game-config';
import * as Phaser from 'phaser';
import { Ambient } from '../systems/Ambient';
import { CineCamera } from '../systems/CineCamera';
import { DayNight } from '../systems/DayNight';
import { buildLayout, buildScenery, type LayoutRefs } from '../world/layout';
import { bakeTerrain, type Terrain } from '../world/terrain';
import { SPRITE_SCALE, bakeSprites, rockTextureKey } from '../world/textures';
import {
  Tile,
  buildCollision,
  generateWorld,
  type Collision,
  type WorldMap,
} from '../world/tilemap';

/** Windmill blade rotation, radians per second. */
const BLADE_SPEED = 0.85;

const DEBUG_CAM_SPEED = 900;

export class WorldScene extends Phaser.Scene {
  private map!: WorldMap;
  private collision!: Collision;
  private terrain!: Terrain;
  private layout!: LayoutRefs;
  private dayNight?: DayNight;
  private ambient!: Ambient;
  private cine?: CineCamera;

  private debugMode = false;
  private debugCam = { x: SPAWN.x * TILE, y: SPAWN.y * TILE };
  private keys?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  private elapsed = 0;
  /** Resting y of the rowboat, so the bob applies to a fixed baseline. */
  private rowboatBaseY = 0;

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(): void {
    this.debugMode =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

    this.map = generateWorld();
    this.collision = buildCollision(this.map);

    bakeSprites(this);
    this.terrain = bakeTerrain(this, this.map);

    this.layout = buildLayout(this);
    buildScenery(this, (tx, ty) => {
      const kind = this.map.at(tx, ty);
      if (kind === Tile.Water || kind === Tile.Dirt) return true;
      return this.collision.blocked(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    });
    this.rowboatBaseY = this.layout.rowboat.y;
    this.placeResourceNodes();

    this.cameras.main.setBounds(0, 0, WORLD.w * TILE, WORLD.h * TILE);

    this.dayNight = new DayNight(this);
    this.ambient = new Ambient(this, this.map);

    if (this.debugMode) {
      this.applyGameplayZoom();
      this.cameras.main.centerOn(this.debugCam.x, this.debugCam.y);
      if (this.input.keyboard) {
        this.keys = this.input.keyboard.addKeys('W,A,S,D') as typeof this.keys;
      }
    } else {
      this.cine = new CineCamera(this);
    }

    this.scale.on('resize', this.onResize, this);

    // HUD runs as a sibling scene so its camera keeps a 1:1 pixel mapping.
    this.scene.launch('HudScene', { map: this.map });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  private applyGameplayZoom(): void {
    this.cameras.main.setZoom(baseZoom(this.scale.width, this.scale.height));
  }

  private onResize(): void {
    if (this.debugMode || !this.cine?.isActive) this.applyGameplayZoom();
  }

  /**
   * Phase 1 draws nodes statically at full health. Phase 3 replaces this with
   * a manager driven by server hp and respawn timestamps.
   */
  private placeResourceNodes(): void {
    for (const slot of NODE_SLOTS) {
      const key = slot.kind === 'oak' ? 'oak' : rockTextureKey(3);
      this.add
        .image(slot.x * TILE + TILE / 2, slot.y * TILE + TILE, key)
        .setOrigin(0.5, 1)
        .setScale(SPRITE_SCALE)
        .setDepth(slot.y * TILE)
        .setPipeline('Light2D');
    }
  }

  // -- accessors used by HudScene ------------------------------------------

  getDayNight(): DayNight | undefined {
    return this.dayNight;
  }

  getBakeMs(): number {
    return this.terrain?.bakeMs ?? 0;
  }

  /** What the minimap should mark — the player once one exists, camera for now. */
  getFocusPoint(): { x: number; y: number } {
    const view = this.cameras.main.worldView;
    return { x: view.centerX, y: view.centerY };
  }

  override update(_time: number, delta: number): void {
    this.elapsed += delta;

    this.dayNight?.update(delta);
    this.ambient.update(delta, this.dayNight?.nightAmount ?? 0);

    this.layout.windmillBlades.rotation += (BLADE_SPEED * delta) / 1000;
    this.layout.rowboat.y = this.rowboatBaseY + Math.sin(this.elapsed / 620) * 3;
    this.layout.rowboat.rotation = Math.sin(this.elapsed / 900) * 0.05;

    if (this.debugMode) this.updateDebugCamera(delta);
    else this.cine?.update(delta);
  }

  private updateDebugCamera(delta: number): void {
    if (!this.keys) return;
    const step = (DEBUG_CAM_SPEED * delta) / 1000;
    if (this.keys.A.isDown) this.debugCam.x -= step;
    if (this.keys.D.isDown) this.debugCam.x += step;
    if (this.keys.W.isDown) this.debugCam.y -= step;
    if (this.keys.S.isDown) this.debugCam.y += step;
    this.cameras.main.centerOn(this.debugCam.x, this.debugCam.y);
  }

  private teardown(): void {
    this.scale.off('resize', this.onResize, this);
    this.dayNight?.destroy();
    this.ambient.destroy();
    this.terrain.destroy();
    this.scene.stop('HudScene');
  }
}
