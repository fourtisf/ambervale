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
    | 'sleep';
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
  /** The invite gate is up; canvas-drawn HUD hides behind it. */
  gated: boolean;
}

type Handler<K extends keyof BridgeEvents> = (payload: BridgeEvents[K]) => void;

class GameBridge {
  private handlers = new Map<keyof BridgeEvents, Set<(payload: never) => void>>();

  /** Last authoritative state, so a late subscriber is never blank. */
  farm: FarmState | null = null;
  /** Set once the player leaves the title screen. */
  started = false;

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
    this.interaction = null;
    this.openModal = null;
    this.gated = false;
    this.input.moveX = 0;
    this.input.moveY = 0;
    this.lastFrameAt = 0;
  }
}

export const bridge = new GameBridge();
