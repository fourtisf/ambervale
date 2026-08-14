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
}

type Handler<K extends keyof BridgeEvents> = (payload: BridgeEvents[K]) => void;

class GameBridge {
  private handlers = new Map<keyof BridgeEvents, Set<(payload: never) => void>>();

  /** Last authoritative state, so a late subscriber is never blank. */
  farm: FarmState | null = null;
  /** Set once the player leaves the title screen. */
  started = false;

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
  }
}

export const bridge = new GameBridge();
