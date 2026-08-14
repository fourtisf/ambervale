/**
 * The world scene.
 *
 * Owns the generated world, the day/night clock and the projection of
 * authoritative farm state (FarmView). The player character stands at SPAWN
 * from Phase 2; movement and interaction arrive in Phase 3.
 *
 * Screen-space HUD lives in HudScene; panels and modals are React.
 */

import { SPAWN, TILE, WORLD, baseZoom, structureAt } from '@ambervale/game-config';
import * as Phaser from 'phaser';
import type { FarmState } from '@/lib/api';
import { bridge } from '../bridge';
import { Ambient } from '../systems/Ambient';
import { CineCamera } from '../systems/CineCamera';
import { DayNight } from '../systems/DayNight';
import { Effects } from '../systems/Effects';
import { FarmView } from '../systems/FarmView';
import { Interactions, stampReceived } from '../systems/Interactions';
import { PlayerController } from '../systems/PlayerController';
import { buildLayout, buildScenery, type LayoutRefs } from '../world/layout';
import { bakeTerrain, type Terrain } from '../world/terrain';
import { SPRITE_SCALE, bakeSprites } from '../world/textures';
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
  private farmView?: FarmView;
  private player?: Phaser.GameObjects.Image;
  private controller?: PlayerController;
  private interactions?: Interactions;
  private effects?: Effects;
  /** Last interaction pushed to the HUD, to avoid re-emitting every frame. */
  private lastInteractionKey = '';
  /** Bouncing "!" over the delivery board when an order can be filled. */
  private boardMark?: Phaser.GameObjects.Text;

  private debugMode = false;
  private debugCam = { x: SPAWN.x * TILE, y: SPAWN.y * TILE };
  private keys?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  private elapsed = 0;
  private rowboatBaseY = 0;
  private unsubscribe: (() => void)[] = [];

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

    this.cameras.main.setBounds(0, 0, WORLD.w * TILE, WORLD.h * TILE);

    this.dayNight = new DayNight(this);
    this.ambient = new Ambient(this, this.map);
    this.farmView = new FarmView(this, this.dayNight);

    this.effects = new Effects(this);
    this.createPlayer();
    this.createBoardMark();

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

    // Hydrate from whatever the bridge already holds, then follow updates.
    if (bridge.farm) this.applyFarm(bridge.farm);
    this.unsubscribe.push(bridge.on('farm', (state) => this.applyFarm(state)));
    this.unsubscribe.push(bridge.on('start', () => this.beginPlay()));

    this.scene.launch('HudScene', { map: this.map });
    bridge.emit('worldReady', undefined);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  private createPlayer(): void {
    const x = SPAWN.x * TILE + TILE / 2;
    const y = SPAWN.y * TILE + TILE / 2;

    this.player = this.add
      .image(x, y, 'player')
      .setOrigin(0.5, 1)
      .setScale(SPRITE_SCALE)
      .setDepth(y)
      .setPipeline('Light2D')
      // Hidden behind the title screen; revealed on Start.
      .setVisible(false);

    // A soft lantern glow so the player stays readable at night.
    const light = this.dayNight?.addDynamicLight(x, y, 170, 0xffd9a0);

    this.controller = new PlayerController(this, this.player, this.collision, light);
    this.interactions = new Interactions(this.controller, this.effects!);
  }

  private createBoardMark(): void {
    const board = structureAt('board');
    this.boardMark = this.add
      .text(board.x * TILE + TILE / 2, (board.y - 1.4) * TILE, '!', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#f4b942',
        stroke: '#0a2e3d',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setDepth(board.y * TILE + 2)
      .setVisible(false);
  }

  /** True when any unlocked, open order can actually be filled right now. */
  private hasFillableOrder(state: FarmState): boolean {
    return state.deliverySlots.some(
      (slot) =>
        slot.unlocked &&
        slot.state === 'open' &&
        slot.itemKey !== null &&
        (state.inventory[slot.itemKey] ?? 0) >= (slot.qty ?? 0),
    );
  }

  private applyFarm(state: FarmState): void {
    stampReceived(state);
    this.farmView?.hydrate(state);
    this.boardMark?.setVisible(this.hasFillableOrder(state));
    // Ghost plots disappear the moment the north meadow is bought.
    this.layout.ghostPlots.setVisible(!state.expansion.north);
  }

  private beginPlay(): void {
    if (!this.player) return;
    this.player.setVisible(true);
    this.cine?.release(this.player);
    if (this.debugMode) this.applyGameplayZoom();
  }

  private applyGameplayZoom(): void {
    this.cameras.main.setZoom(baseZoom(this.scale.width, this.scale.height));
  }

  private onResize(): void {
    if (this.debugMode || !this.cine?.isActive) this.applyGameplayZoom();
  }

  // -- accessors used by HudScene ------------------------------------------

  getDayNight(): DayNight | undefined {
    return this.dayNight;
  }

  getBakeMs(): number {
    return this.terrain?.bakeMs ?? 0;
  }

  /** What the minimap marks: the player once playing, the camera before that. */
  getFocusPoint(): { x: number; y: number } {
    if (bridge.started && this.player) return { x: this.player.x, y: this.player.y };
    const view = this.cameras.main.worldView;
    return { x: view.centerX, y: view.centerY };
  }

  override update(_time: number, delta: number): void {
    this.elapsed += delta;

    this.dayNight?.update(delta);
    this.ambient.update(delta, this.dayNight?.nightAmount ?? 0);
    this.farmView?.update(delta);
    this.controller?.update(delta);
    this.pushInteraction();

    if (this.boardMark?.visible) {
      const board = structureAt('board');
      this.boardMark.y = (board.y - 1.4) * TILE + Math.sin(this.elapsed / 260) * 6;
    }

    this.layout.windmillBlades.rotation += (BLADE_SPEED * delta) / 1000;
    this.layout.rowboat.y = this.rowboatBaseY + Math.sin(this.elapsed / 620) * 3;
    this.layout.rowboat.rotation = Math.sin(this.elapsed / 900) * 0.05;

    if (this.debugMode) this.updateDebugCamera(delta);
    else this.cine?.update(delta);
  }

  /**
   * Publishes the current interaction to the HUD, but only when it actually
   * changes — this runs every frame and React should not re-render 60 times a
   * second because a countdown ticked a millisecond.
   */
  private pushInteraction(): void {
    if (!this.interactions) return;
    const interaction = this.interactions.currentInteraction();
    const key = interaction
      ? `${interaction.kind}:${interaction.target}:${interaction.enabled}:${
          interaction.remainingMs ? Math.ceil(interaction.remainingMs / 1000) : ''
        }`
      : '';
    if (key === this.lastInteractionKey) return;
    this.lastInteractionKey = key;
    bridge.emit('interaction', interaction);
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
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.scale.off('resize', this.onResize, this);
    this.controller?.destroy();
    this.dayNight?.destroy();
    this.ambient.destroy();
    this.farmView?.destroy();
    this.terrain.destroy();
    this.scene.stop('HudScene');
  }
}
