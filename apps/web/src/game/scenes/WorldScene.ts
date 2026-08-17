/**
 * The world scene.
 *
 * Owns the generated world, the day/night clock and the projection of
 * authoritative farm state (FarmView). The player character stands at SPAWN
 * from Phase 2; movement and interaction arrive in Phase 3.
 *
 * Screen-space HUD lives in HudScene; panels and modals are React.
 */

import {
  CAVE_ENTRY,
  CAVE_EXIT,
  CAVE_TORCHES,
  SPAWN,
  TILE,
  WORLD,
  baseZoom,
  structureAt,
} from '@ambervale/game-config';
import * as Phaser from 'phaser';
import type { FarmState } from '@/lib/api';
import { bridge } from '../bridge';
import { audio } from '@/lib/audio';
import { Ambient } from '../systems/Ambient';
import { AnimalLife } from '../systems/AnimalLife';
import { CineCamera } from '../systems/CineCamera';
import { DayNight } from '../systems/DayNight';
import { Dog } from '../systems/Dog';
import { Effects } from '../systems/Effects';
import { FarmView } from '../systems/FarmView';
import { Interactions, stampReceived } from '../systems/Interactions';
import { Occlusion } from '../systems/Occlusion';
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
  private dog?: Dog;
  /** Fades trees and buildings that would otherwise hide the player. */
  private occlusion!: Occlusion;
  /** Last interaction pushed to the HUD, to avoid re-emitting every frame. */
  private lastInteractionKey = '';
  /** Bouncing "!" over the delivery board when an order can be filled. */
  private boardMark?: Phaser.GameObjects.Text;
  /** True while a tutorial camera peek is in flight. */
  private peeking = false;
  private peekDeadline = 0;
  /** Whether the camera is currently locked to the player. */
  private followingPlayer = false;
  /** True while the player holds the ship's helm. */
  private sailing = false;
  private shipVel = { x: 0, y: 0 };
  private helmKeys?: Record<
    'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT',
    Phaser.Input.Keyboard.Key
  >;
  private lastWakeAt = 0;
  private wakeCount = 0;
  /** Where a tap asked the ship to go, mirrored from pointerdown while sailing. */
  private sailTarget: { x: number; y: number } | null = null;

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

    this.occlusion = new Occlusion(new Phaser.Geom.Rectangle());

    this.layout = buildLayout(this);
    const scenery = buildScenery(this, (tx, ty) => {
      const kind = this.map.at(tx, ty);
      if (kind === Tile.Water || kind === Tile.Dirt) return true;
      // No pines underground — the chamber floor is walkable but not meadow.
      if (kind === Tile.Cave || kind === Tile.CaveWall) return true;
      return this.collision.blocked(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    });
    this.occlusion.registerAll(this.layout.occluders);
    this.occlusion.registerAll(scenery);
    this.rowboatBaseY = this.layout.rowboat.y;

    this.cameras.main.setBounds(0, 0, WORLD.w * TILE, WORLD.h * TILE);

    this.dayNight = new DayNight(this);
    this.ambient = new Ambient(this, this.map);
    this.animalLife = new AnimalLife(this);
    this.farmView = new FarmView(this, this.dayNight, this.animalLife, this.occlusion);

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
    // Start may already have been pressed — sprite baking takes real seconds
    // on a slow device, and a press that lands mid-boot was emitted into a
    // room this scene had not entered yet. Without this catch-up the player
    // stays invisible and the camera never attaches, for the whole session.
    if (bridge.started) this.beginPlay();
    this.unsubscribe.push(bridge.on('sleep', () => this.sleep()));
    this.unsubscribe.push(
      bridge.on('row', (dir) => (dir === 'board' ? this.board() : this.stepAshore())),
    );
    // The helm's own keys, alive in every mode — the controller keeps its
    // pair, and freezing it must not take the ship's steering with it.
    if (this.input.keyboard) {
      this.helmKeys = this.input.keyboard.addKeys(
        'W,A,S,D,UP,LEFT,DOWN,RIGHT',
      ) as typeof this.helmKeys;
    }
    this.unsubscribe.push(bridge.on('delve', (dir) => this.delve(dir)));

    // Tap-to-sail. Most desktop players move by clicking, and a helm that
    // only answers to stick and keys reads as a ship that will not steer.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.sailing || bridge.openModal || !bridge.started) return;
      this.sailTarget = { x: pointer.worldX, y: pointer.worldY };
    });

    // The chamber's torches burn at every hour; their warmth is a dynamic
    // light so the Light2D sprites near them catch it after dark.
    for (const t of CAVE_TORCHES) {
      this.dayNight?.addDynamicLight(t.x * TILE + TILE / 2, (t.y + 0.6) * TILE, 170, 0xffa94d);
    }

    // The boat starts on the home shore; the interaction scan reads this.
    bridge.boatAt = {
      x: this.layout.rowboat.x,
      y: this.layout.rowboat.y,
      shore: 'west',
    };

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
    this.dog = new Dog(this, this.collision);
    this.interactions = new Interactions(this.controller, this.effects!, this.farmView);
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
    // Each zone's dashed outlines disappear the moment that zone is bought.
    this.layout.ghostPlots['north']?.setVisible(!state.expansion.north);
    this.layout.ghostPlots['east']?.setVisible(!state.expansion.east);
    this.layout.ghostPlots['isle']?.setVisible(!state.expansion.isle);

    // The Homestead: the house sprite follows the tier. Same image object, so
    // occlusion and depth carry over; only the texture (and thus size) change.
    const houseKey =
      state.homesteadTier >= 3
        ? 'houseManor'
        : state.homesteadTier >= 2
          ? 'houseFarmhouse'
          : 'house';
    if (this.layout.house.texture.key !== houseKey) {
      this.layout.house.setTexture(houseKey);
    }
  }

  private beginPlay(): void {
    if (!this.player) return;
    this.player.setVisible(true);
    this.cine?.release(this.player);
    this.followingPlayer = true;
    if (this.debugMode) this.applyGameplayZoom();
  }

  /**
   * Sleeping at the house: a fade, and the clock lands on sunrise.
   *
   * Nothing about the farm moves. Growth, eggs and respawns are all server-side
   * wall-clock, and a client that could skip them would be the largest exploit
   * in the game — so this buys the view and nothing else, and says so.
   */
  private sleep(): void {
    if (!bridge.started) return;

    if (!this.dayNight?.skipToDawn()) {
      bridge.toast('info', 'It is already daylight. Nothing to sleep through.');
      return;
    }

    const cam = this.cameras.main;
    cam.fadeOut(320, 5, 12, 20);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => cam.fadeIn(520, 5, 12, 20));
    bridge.toast('info', 'You sleep until sunrise. The farm kept its own time.');
  }

  /**
   * The helm. Boarding hands the ship to the player: their stick and keys
   * drive her directly, with inertia, and she goes only where there is water.
   * Pure traversal — no request, no server state — and stepping ashore is a
   * verb of its own, offered wherever the shoreline is within a stride.
   */
  private board(): void {
    if (this.sailing || !this.player || !this.controller || this.controller.frozen) return;

    this.sailing = true;
    bridge.sailing = true;
    this.controller.frozen = true;
    this.shipVel = { x: 0, y: 0 };
    this.sailTarget = null;
    audio.creak();
    audio.row();
    bridge.toast(
      'info',
      'The helm is yours — stick, arrow keys, or tap the water. Step ashore where water meets land.',
    );
  }

  private stepAshore(): void {
    if (!this.sailing || !this.controller) return;
    const spot = bridge.shoreAt;
    if (!spot) return;

    const boat = this.layout.rowboat;
    this.sailing = false;
    bridge.sailing = false;
    bridge.shoreAt = null;
    this.sailTarget = null;
    boat.setAngle(0);
    this.rowboatBaseY = boat.y;
    // Which side of the channel she is moored on only matters for flavour
    // now, but the mirror keeps it truthful.
    bridge.boatAt = {
      x: boat.x,
      y: boat.y,
      shore: boat.x < 52 * TILE ? 'west' : 'east',
    };

    this.controller.placeAt(spot.x, spot.y);
    this.controller.frozen = false;
    this.dog?.place(spot.x + 26, spot.y + 20);
    audio.row();
  }

  /** Drives the ship from input, one frame. Only called while sailing. */
  private updateHelm(deltaMs: number): void {
    const boat = this.layout.rowboat;
    const player = this.player;
    if (!player) return;
    const dt = deltaMs / 1000;

    // Stick first, keys override — the same order the controller uses.
    let ix = 0;
    let iy = 0;
    if (!bridge.openModal) {
      ix = bridge.input.moveX;
      iy = bridge.input.moveY;
      const k = this.helmKeys;
      if (k) {
        let kx = 0;
        let ky = 0;
        if (k.A.isDown || k.LEFT.isDown) kx -= 1;
        if (k.D.isDown || k.RIGHT.isDown) kx += 1;
        if (k.W.isDown || k.UP.isDown) ky -= 1;
        if (k.S.isDown || k.DOWN.isDown) ky += 1;
        if (kx !== 0 || ky !== 0) {
          ix = kx;
          iy = ky;
        }
      }
    }
    // Direct input wins; a tapped course steers only while nothing else
    // does, and the tap is forgotten the moment the player grabs the helm.
    if (ix !== 0 || iy !== 0) {
      this.sailTarget = null;
    } else if (this.sailTarget) {
      const dx = this.sailTarget.x - boat.x;
      const dy = this.sailTarget.y - boat.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 26) {
        this.sailTarget = null;
      } else {
        // Ease off approaching the mark, so she arrives rather than orbits.
        const throttle = Math.min(1, dist / 130);
        ix = (dx / dist) * throttle;
        iy = (dy / dist) * throttle;
      }
    }

    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    // Inertia: she leans toward the ordered speed rather than snapping to
    // it. A ship that stops like a character stops feels like a costume.
    const MAX = 190;
    const blend = 1 - Math.pow(0.001, dt);
    this.shipVel.x += (ix * MAX - this.shipVel.x) * blend;
    this.shipVel.y += (iy * MAX - this.shipVel.y) * blend;

    // Water only, axis by axis so she slides along the shore, never onto it.
    const floats = (px: number, py: number): boolean => {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 1 || ty < 1 || tx >= WORLD.w - 1 || ty >= WORLD.h - 1) return false;
      return this.map.isWater(tx, ty);
    };
    let nx = boat.x + this.shipVel.x * dt;
    let ny = boat.y + this.shipVel.y * dt;
    if (!floats(nx, boat.y)) {
      nx = boat.x;
      this.shipVel.x = 0;
    }
    if (!floats(nx, ny)) {
      ny = boat.y;
      this.shipVel.y = 0;
    }
    boat.setPosition(nx, ny);
    boat.setDepth(ny);

    const speed = Math.hypot(this.shipVel.x, this.shipVel.y);
    if (Math.abs(this.shipVel.x) > 18) boat.setFlipX(this.shipVel.x < 0);
    boat.setAngle(Math.sin(this.elapsed / 380) * (speed > 40 ? 2 : 0.8));

    // The player stands the deck; the rail sits well above the waterline.
    player.setPosition(boat.x - 4, boat.y - 28);
    player.setDepth(ny + 1);

    // Wake and water sounds only when she is actually making way.
    if (speed > 55 && this.elapsed - this.lastWakeAt > 640) {
      this.lastWakeAt = this.elapsed;
      if (this.wakeCount++ % 2 === 0) audio.row();
      const back =
        speed > 0 ? { x: -this.shipVel.x / speed, y: -this.shipVel.y / speed } : { x: 0, y: 0 };
      const ring = this.add
        .ellipse(boat.x + back.x * 70, boat.y - 4 + back.y * 30, 12, 7)
        .setStrokeStyle(2.5, 0xd6ecf6, 0.7)
        .setDepth(ny - 2);
      this.tweens.add({
        targets: ring,
        scaleX: 3.2,
        scaleY: 2.6,
        alpha: 0,
        duration: 1100,
        ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      });
    }

    // Can we land here? Scanned every frame; the action button reads it.
    bridge.shoreAt = this.findShore(boat.x, boat.y);
    bridge.boatAt = { x: boat.x, y: boat.y, shore: boat.x < 52 * TILE ? 'west' : 'east' };
  }

  /**
   * Nearest ground a person could actually stand on, within a stride of the
   * ship: land or dock planks, never open water, never a building's box.
   */
  private findShore(px: number, py: number): { x: number; y: number } | null {
    const ctx = Math.floor(px / TILE);
    const cty = Math.floor(py / TILE);
    let best: { x: number; y: number } | null = null;
    let bestDist = 150;

    for (let ty = cty - 2; ty <= cty + 2; ty++) {
      for (let tx = ctx - 2; tx <= ctx + 2; tx++) {
        if (tx < 1 || ty < 1 || tx >= WORLD.w - 1 || ty >= WORLD.h - 1) continue;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        if (this.collision.blocked(cx, cy)) continue;
        const d = Math.hypot(cx - px, cy - py);
        if (d < bestDist) {
          bestDist = d;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  }

  /**
   * Through the mouth of the Amber Deep, or back out. A short fade sells the
   * passage through rock that the map cannot actually tunnel; the chamber is
   * an enclosed pocket on this same map, so every system — mining, effects,
   * the action button, the dog — simply keeps working inside.
   */
  private delve(dir: 'in' | 'out'): void {
    // `frozen` doubles as the in-progress latch: a second press during the
    // fade would queue a duplicate teleport onto the same completion event.
    if (!this.controller || this.controller.frozen) return;

    const to = dir === 'in' ? CAVE_ENTRY : CAVE_EXIT;
    const cam = this.cameras.main;
    this.controller.frozen = true;
    audio.delve(dir);

    cam.fadeOut(280, 8, 6, 5);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const x = to.x * TILE + TILE / 2;
      const y = to.y * TILE + TILE / 2;
      this.controller?.placeAt(x, y);
      this.dog?.place(x + 26, y + 18);
      if (this.controller) this.controller.frozen = false;
      cam.fadeIn(420, 8, 6, 5);
      if (dir === 'in')
        bridge.toast('info', 'The Amber Deep. The veins regrow slowly — take your time.');
    });
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
    // Heartbeat for the controls' freeze watchdog. First line of update(), so
    // it is stamped even if something below throws.
    bridge.lastFrameAt = Date.now();
    // Mirrored for the task escort, which needs to know whether the player is
    // actually standing where it sent them — a question no interaction can
    // answer while the thing being waited for is not yet actionable.
    if (this.player) bridge.playerAt = { x: this.player.x, y: this.player.y };
    this.elapsed += delta;

    this.dayNight?.update(delta);
    this.ambient.update(delta, this.dayNight?.nightAmount ?? 0);
    this.farmView?.update(delta);
    this.animalLife?.update(delta);
    this.controller?.update(delta);
    if (this.player) this.dog?.update(delta, this.player.x, this.player.y);
    if (this.controller && bridge.started) {
      this.occlusion.update(this.controller.x, this.controller.y, delta);
    }
    this.syncAmbience();
    this.tutorial?.update(delta);
    this.pushInteraction();

    if (this.boardMark?.visible) {
      const board = structureAt('board');
      this.boardMark.y = (board.y - 1.4) * TILE + Math.sin(this.elapsed / 260) * 6;
    }

    this.layout.windmillBlades.rotation += (BLADE_SPEED * delta) / 1000;
    if (this.sailing) {
      if (bridge.started) this.updateHelm(delta);
    } else {
      this.layout.rowboat.y = this.rowboatBaseY + Math.sin(this.elapsed / 620) * 3;
      this.layout.rowboat.rotation = Math.sin(this.elapsed / 900) * 0.05;
    }

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
    const mode = night > 0.5 ? 'night' : 'day';
    audio.setAmbience(mode);
    audio.setMusic(mode);
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
    audio.stop();
    this.dog?.destroy();
    this.animalLife?.destroy();
    this.occlusion?.destroy();
    this.tutorial?.destroy();
    this.controller?.destroy();
    this.dayNight?.destroy();
    this.ambient.destroy();
    this.farmView?.destroy();
    this.terrain.destroy();
    this.scene.stop('HudScene');
  }
}
