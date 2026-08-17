/**
 * The React ↔ Phaser bridge.
 *
 * Phaser owns the world; React owns the HUD, modals and toasts. They never
 * touch each other's objects — they exchange messages through this one
 * emitter, and both read the same authoritative FarmState.
 *
 * Keeping it a plain module singleton (rather than context or the Phaser
 * registry) means either side can import it without threading a reference
 * through a scene tree or a component tree.
 */

import type { FarmState } from '@/lib/api';

export interface ToastMessage {
  id: number;
  kind: 'info' | 'good' | 'warn' | 'bad';
  text: string;
}

/** What the player can currently do, driving the contextual action button. */
export interface Interaction {
  kind:
    | 'plant'
    | 'water'
    | 'shoo'
    | 'harvest'
    | 'chop'
    | 'mine'
    | 'sell'
    | 'buy'
    | 'deliver'
    | 'egg'
    | 'milk'
    | 'fish'
    | 'mill'
    | 'bag'
    | 'sleep'
    | 'row'
    | 'delve'
    | 'dog';
  label: string;
  /** Plot/node index or ground-item id, whichever the action needs. */
  target: number | string;
  /** False while the action is known to be rejected (e.g. crop still growing). */
  enabled: boolean;
  /** Countdown shown on the button when a crop is not ready. */
  remainingMs?: number;
}

/** Events React and Phaser send each other. */
export interface BridgeEvents {
  /** Authoritative state changed; both sides re-render from it. */
  farm: FarmState;
  /** Player pressed Start on the title screen. */
  start: void;
  /** The world scene finished booting and is ready to be driven. */
  worldReady: void;
  /** Something to surface in the toast stack. */
  toast: Omit<ToastMessage, 'id'>;
  /** Levels crossed, so the HUD can celebrate. */
  levelUp: number[];
  /** Coins/amber flew to the HUD — world position to fly from. */
  fly: { kind: 'coin' | 'amber' | 'xp'; amount: number; x: number; y: number };
  /** What the player is standing next to, or null. */
  interaction: Interaction | null;
  /** The action button (or E) was pressed. */
  act: void;
  /** UI asked the world to walk somewhere, e.g. tutorial "Guide me". */
  walkTo: { x: number; y: number };
  /** A modal opened or closed; the world pauses input while one is up. */
  modal: string | null;
  /** The player slept at the house; the world skips its clock to dawn. */
  sleep: void;
  /** The player boarded the ship, or stepped off it onto the shore. */
  row: 'board' | 'ashore';
  /** The player stepped through the Amber Deep's mouth, or climbed out. */
  delve: 'in' | 'out';
  /** The player petted the dog; she reacts. */
  petDog: void;
  /** The invite gate is up; canvas-drawn HUD hides behind it. */
  gated: boolean;
  /**
   * The goal the player is being walked through, or null to stop.
   *
   * Held here rather than in a component so any sheet can hand a goal over and
   * then close itself — the escort outlives the panel it was started from,
   * which is the entire point of it.
   */
  escort: string | null;
}

type Handler<K extends keyof BridgeEvents> = (payload: BridgeEvents[K]) => void;

class GameBridge {
  private handlers = new Map<keyof BridgeEvents, Set<(payload: never) => void>>();

  /** Last authoritative state, so a late subscriber is never blank. */
  farm: FarmState | null = null;
  /** Set once the player leaves the title screen. */
  started = false;

  /**
   * True when the world is showing someone ELSE'S farm. The scan for
   * interactions returns nothing in this mode — a visitor walks, looks, and
   * signs the guestbook; every other verb belongs to the owner.
   */
  spectator = false;

  /**
   * Movement intent, in the range [-1, 1] per axis.
   *
   * Deliberately a mutable object polled once per frame rather than an event:
   * a joystick fires pointermove far more often than the game renders, and
   * emitting each one would be pure overhead.
   */
  readonly input = { moveX: 0, moveY: 0 };

  /** Current interaction, mirrored here so late subscribers see it. */
  interaction: Interaction | null = null;

  /** Set while a modal is open, so world input stays inert underneath it. */
  openModal: string | null = null;

  /**
   * Whether the invite gate is covering the world.
   *
   * Mirrored rather than only emitted because HudScene is launched by
   * WorldScene, not by the game boot — so React invariably decides the gate
   * before there is any scene to tell, and an event alone would be shouted
   * into an empty room.
   */
  gated = false;

  /**
   * When the world last rendered a frame, as `Date.now()`.
   *
   * React and Phaser fail independently: a lost WebGL context freezes the
   * world while the HUD carries on ticking, which on screen is a joystick that
   * moves and a character that does not. Nothing else can tell those two apart,
   * so the world stamps its heartbeat here and the controls watch it.
   */
  lastFrameAt = 0;

  /**
   * Where the player is standing, mirrored each frame.
   *
   * A plain field rather than an event: it changes sixty times a second and
   * nothing wants to re-render at that rate. The one reader polls it once a
   * second, which is the right granularity for "are you there yet".
   */
  playerAt: { x: number; y: number } | null = null;

  /**
   * Where the rowboat is moored, mirrored by the world whenever it moves.
   *
   * The boat lives on whichever shore it was last rowed to, and the "row"
   * interaction has to stand where the boat actually is — so the scene owns
   * the truth and mirrors it here for the interaction scan to read.
   */
  boatAt: { x: number; y: number; shore: 'west' | 'east' } | null = null;

  /** Where the dog is, mirrored each frame like playerAt. */
  dogAt: { x: number; y: number } | null = null;

  /** True while the player holds the ship's helm. */
  sailing = false;

  /**
   * The nearest walkable ground the ship could put the player ashore on,
   * scanned each frame while sailing. Null in open water — which is exactly
   * when the action button should say so and refuse.
   */
  shoreAt: { x: number; y: number } | null = null;

  on<K extends keyof BridgeEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => this.off(event, handler);
  }

  off<K extends keyof BridgeEvents>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof BridgeEvents>(event: K, payload: BridgeEvents[K]): void {
    if (event === 'farm') this.farm = payload as FarmState;
    if (event === 'start') this.started = true;
    if (event === 'interaction') this.interaction = payload as Interaction | null;
    if (event === 'modal') this.openModal = payload as string | null;
    if (event === 'gated') this.gated = payload as boolean;

    for (const handler of this.handlers.get(event) ?? []) {
      (handler as Handler<K>)(payload);
    }
  }

  toast(kind: ToastMessage['kind'], text: string): void {
    this.emit('toast', { kind, text });
  }

  /** Full reset, for a clean remount in React Strict Mode. */
  reset(): void {
    this.handlers.clear();
    this.farm = null;
    this.started = false;
    this.spectator = false;
    this.boatAt = null;
    this.dogAt = null;
    this.sailing = false;
    this.shoreAt = null;
    this.interaction = null;
    this.openModal = null;
    this.gated = false;
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.lastFrameAt = 0;
    this.playerAt = null;
  }
}

export const bridge = new GameBridge();
