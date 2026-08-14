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
import { audio } from '@/lib/audio';
import { Ambient } from '../systems/Ambient';
import { AnimalLife } from '../systems/AnimalLife';
import { CineCamera } from '../systems/CineCamera';
import { DayNight } from '../systems/DayNight';
import { Effects } from '../systems/Effects';
import { FarmView } from '../systems/FarmView';
import { Interactions, stampReceived } from '../systems/Interactions';
import { PlayerController } from '../systems/PlayerController';
import { TutorialGuide } from '../systems/TutorialGuide';
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

/** How long the camera lingers on a tutorial objective before returning. */
const PEEK_OUT_MS = 1350;
const PEEK_BACK_MS = 950;

/**
 * Hard ceiling on a peek. If a pan is interrupted its callback may never fire,
 * and without this the camera would stay detached from the player forever.
 */
const PEEK_TIMEOUT_MS = PEEK_OUT_MS + PEEK_BACK_MS + 1200;

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
  private tutorial?: TutorialGuide;
  private animalLife?: AnimalLife;
  /** Last interaction pushed to the HUD, to avoid re-emitting every frame. */
  private lastInteractionKey = '';
  /** Bouncing "!" over the delivery board when an order can be filled. */
  private boardMark?: Phaser.GameObjects.Text;
  /** True while a tutorial camera peek is in flight. */
  private peeking = false;
  private peekDeadline = 0;
  /** Whether the camera is currently locked to the player. */
  private followingPlayer = false;

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
    this.animalLife = new AnimalLife(this);
    this.farmView = new FarmView(this, this.dayNight, this.animalLife);

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
    this.tutorial = new TutorialGuide(this, this.controller, this.interactions, (x, y) =>
      this.peekAt(x, y),
    );
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
    this.followingPlayer = true;
    if (this.debugMode) this.applyGameplayZoom();
  }

  /** Locks the camera back onto the player. */
  private followPlayer(): void {
    if (!this.player) return;
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.followingPlayer = true;
  }

  /**
   * Eases the camera out to a point and back, then re-attaches it.
   *
   * Two details are load-bearing. The return pan passes force=true: it is
   * started from inside the outgoing pan's own completion callback, and while
   * that effect is still marked running Phaser silently drops a non-forced
   * pan — which strands the camera wherever it stopped, with follow already
   * released. And `peeking` is watchdogged in update(), because any pan whose
   * callback never fires would otherwise leave the camera detached for good.
   */
  peekAt(x: number, y: number): void {
    if (!this.player || !bridge.started || this.peeking) return;

    const cam = this.cameras.main;
    this.peeking = true;
    this.peekDeadline = this.elapsed + PEEK_TIMEOUT_MS;

    cam.stopFollow();
    this.followingPlayer = false;

    cam.pan(x, y, PEEK_OUT_MS, 'Sine.easeInOut', true, (_cam, progress) => {
      if (progress < 1 || !this.peeking) return;
      const px = this.player?.x ?? x;
      const py = this.player?.y ?? y;
      cam.pan(px, py, PEEK_BACK_MS, 'Sine.easeInOut', true, (_c2, p2) => {
        if (p2 < 1 || !this.peeking) return;
        this.endPeek();
      });
    });
  }

  private endPeek(): void {
    this.peeking = false;
    this.followPlayer();
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

  /** Current tutorial objective in world space, for HudScene's edge arrow. */
  getObjective(): { x: number; y: number } | null {
    return this.tutorial?.target ?? null;
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
    this.animalLife?.update(delta);
    this.controller?.update(delta);
    this.syncAmbience();
    this.tutorial?.update(delta);
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

    this.watchCamera();
  }

  /**
   * Safety net for the camera.
   *
   * A peek that overruns its deadline is abandoned and the camera handed back
   * to the player. Losing the camera is far worse than losing the flourish:
   * without this, one dropped pan callback leaves the player unable to see
   * themselves for the rest of the session.
   */
  private watchCamera(): void {
    if (!bridge.started || this.debugMode || this.cine?.isActive) return;

    if (this.peeking && this.elapsed > this.peekDeadline) {
      this.endPeek();
      return;
    }
    if (!this.peeking && !this.followingPlayer) this.followPlayer();
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

  /**
   * Birds by day, crickets at night. Driven off the same cycle position the
   * lighting uses, so sound and sky never disagree.
   */
  private syncAmbience(): void {
    if (!bridge.started) return;
    const night = this.dayNight?.nightAmount ?? 0;
    audio.setAmbience(night > 0.5 ? 'night' : 'day');
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
    audio.setAmbience(null);
    this.animalLife?.destroy();
    this.tutorial?.destroy();
    this.controller?.destroy();
    this.dayNight?.destroy();
    this.ambient.destroy();
    this.farmView?.destroy();
    this.terrain.destroy();
    this.scene.stop('HudScene');
  }
}
