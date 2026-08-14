/**
 * Contextual interaction: what is in reach, and what happens when you press it.
 *
 * Actions are sent optimistically — the swing plays immediately — but nothing
 * is *believed* until the response lands. Every reply carries the whole farm,
 * so a rejected action simply re-renders the unchanged truth and the optimistic
 * flourish is the only thing that was ever speculative.
 */

import {
  ANIMALS,
  CROPS,
  PADDOCKS,
  PLAYER,
  TILE,
  nodeSlotAt,
  plotAt,
  structureAt,
  type CropKey,
} from '@ambervale/game-config';
import { bridge, type Interaction } from '../bridge';
import { ApiRequestError, apiPost, type FarmState } from '@/lib/api';
import { audio } from '@/lib/audio';
import { COLORS, type Effects } from './Effects';
import type { PlayerController } from './PlayerController';

interface ActionReply {
  farm: FarmState;
  levelUps?: number[];
  questCompleted?: { id: string; text: string; reward: { coins?: number; amber?: number } } | null;
  gained?: Record<string, number>;
  coinsGained?: number;
  xp?: number;
  felled?: boolean;
  hp?: number;
  seedGained?: string | null;
  catchLabel?: string;
  daily?: {
    completed: { id: string; text: string; reward: { coins?: number; amber?: number } }[];
    dayComplete: { streak: number; amber: number; coins: number } | null;
  };
  levelRewards?: { level: number; reward: { note?: string; coins?: number; amber?: number } }[];
}

/** Which seed to plant when the player presses the plant action. */
function preferredSeed(farm: FarmState): CropKey | null {
  const owned = (Object.entries(farm.seeds) as [CropKey, number][])
    .filter(([key, qty]) => qty > 0 && CROPS[key] && farm.user.level >= CROPS[key].unlockLv)
    // Most valuable crop the player can actually plant.
    .sort((a, b) => CROPS[b[0]].sell - CROPS[a[0]].sell);
  return owned[0]?.[0] ?? null;
}

export class Interactions {
  private readonly player: PlayerController;
  private readonly effects: Effects;
  private busy = false;
  /** Seed the UI asked us to plant next, overriding the default choice. */
  forcedSeed: CropKey | null = null;

  constructor(player: PlayerController, effects: Effects) {
    this.player = player;
    this.effects = effects;
    bridge.on('act', () => void this.perform());
  }

  /** Recomputes what is in reach. Called every frame; pure, no side effects. */
  currentInteraction(): Interaction | null {
    const farm = bridge.farm;
    if (!farm || !bridge.started) return null;

    const reach = PLAYER.reach;
    const candidates: { interaction: Interaction; distance: number }[] = [];

    const consider = (interaction: Interaction, x: number, y: number) => {
      const distance = this.player.distanceTo(x, y);
      if (distance <= reach) candidates.push({ interaction, distance });
    };

    // Ground eggs first — they are small and easy to miss otherwise.
    for (const item of farm.groundItems) {
      consider(
        { kind: 'egg', label: 'Collect egg', target: item.id, enabled: true },
        item.x,
        item.y,
      );
    }

    // Plots
    for (const plot of farm.plots) {
      const slot = plotAt(plot.index);
      if (!slot) continue;
      if (slot.zone !== 'base' && farm.expansion[slot.zone] !== true) continue;

      const x = slot.x * TILE + TILE / 2;
      const y = slot.y * TILE + TILE / 2;

      if (!plot.cropKey) {
        const seed = this.forcedSeed ?? preferredSeed(farm);
        consider(
          {
            kind: 'plant',
            label: seed ? `Plant ${seed}` : 'No seeds',
            target: plot.index,
            enabled: seed !== null,
          },
          x,
          y,
        );
      } else if (plot.readyAt !== null) {
        const remainingMs = plot.readyAt - this.serverNow(farm);
        consider(
          {
            kind: 'harvest',
            label: remainingMs > 0 ? 'Growing' : `Harvest ${plot.cropKey}`,
            target: plot.index,
            enabled: remainingMs <= 0,
            ...(remainingMs > 0 ? { remainingMs } : {}),
          },
          x,
          y,
        );
      }
    }

    // Resource nodes
    for (const node of farm.nodes) {
      const slot = nodeSlotAt(node.index);
      if (!slot) continue;
      const alive =
        node.hp > 0 || (node.respawnAt !== null && node.respawnAt <= this.serverNow(farm));
      consider(
        {
          kind: slot.kind === 'oak' ? 'chop' : 'mine',
          label: alive ? (slot.kind === 'oak' ? 'Chop oak' : 'Mine rock') : 'Regrowing',
          target: node.index,
          enabled: alive,
        },
        slot.x * TILE + TILE / 2,
        slot.y * TILE + TILE,
      );
    }

    // The cow, when it has milk waiting
    const cow = farm.animals.find((a) => a.kind === 'cow');
    if (cow?.ready) {
      const p = PADDOCKS.cow;
      const t = (ANIMALS.chicken.count + 1) / 5;
      consider(
        { kind: 'milk', label: 'Milk the cow', target: cow.index, enabled: true },
        (p.x + p.w * t) * TILE,
        (p.y + p.h * (0.3 + 0.4 * t)) * TILE,
      );
    }

    // Buildings open modals rather than acting directly.
    const market = structureAt('market');
    consider(
      { kind: 'sell', label: 'Market', target: 'market', enabled: true },
      market.x * TILE + TILE / 2,
      market.y * TILE,
    );

    const board = structureAt('board');
    consider(
      {
        kind: 'deliver',
        label: 'Deliveries',
        target: 'board',
        enabled: true,
      },
      board.x * TILE + TILE / 2,
      board.y * TILE,
    );

    // The buildings below used to be scenery. Each now carries one verb.
    const dock = structureAt('dock');
    consider(
      {
        kind: 'fish',
        label: farm.effects.canFish ? 'Cast a line' : 'Need a rod',
        target: 'dock',
        enabled: farm.effects.canFish,
      },
      dock.x * TILE + TILE / 2,
      dock.y * TILE + TILE / 2,
    );

    const mill = structureAt('windmill');
    consider(
      { kind: 'mill', label: 'The mill', target: 'windmill', enabled: true },
      mill.x * TILE + TILE / 2,
      mill.y * TILE,
    );

    const barn = structureAt('barn');
    consider(
      { kind: 'bag', label: 'Barn store', target: 'barn', enabled: true },
      barn.x * TILE + TILE / 2,
      barn.y * TILE,
    );

    const house = structureAt('house');
    consider(
      { kind: 'sleep', label: 'Sleep', target: 'house', enabled: true },
      house.x * TILE + TILE / 2,
      house.y * TILE,
    );

    if (candidates.length === 0) return null;
    // Nearest wins, so standing between a plot and a tree does the obvious thing.
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0]!.interaction;
  }

  private serverNow(farm: FarmState): number {
    // The scene refreshes farm.serverNow on every reply; between replies we
    // extrapolate with the local clock, which is fine at this granularity.
    return Date.now() + (farm.serverNow - (farm.__receivedAt ?? farm.serverNow));
  }

  /** Runs the current interaction. */
  private async perform(): Promise<void> {
    const interaction = bridge.interaction;
    const farm = bridge.farm;
    if (!interaction || !farm || this.busy) return;

    if (!interaction.enabled) {
      if (interaction.remainingMs) {
        const secs = Math.ceil(interaction.remainingMs / 1000);
        this.effects.float(this.player.x, this.player.y - 40, `${secs}s`, '#9fe8ff');
      }
      audio.error();
      return;
    }

    // Buildings just open UI; no request, no lock.
    if (interaction.kind === 'sell') return void bridge.emit('modal', 'market');
    if (interaction.kind === 'deliver') return void bridge.emit('modal', 'deliveries');
    if (interaction.kind === 'mill') return void bridge.emit('modal', 'mill');
    if (interaction.kind === 'bag') return void bridge.emit('modal', 'bag');
    if (interaction.kind === 'sleep') return void bridge.emit('sleep', undefined);

    this.busy = true;
    try {
      await this.dispatch(interaction, farm);
    } catch (err) {
      this.handleFailure(err);
    } finally {
      this.busy = false;
    }
  }

  private async dispatch(interaction: Interaction, farm: FarmState): Promise<void> {
    const px = this.player.x;
    const py = this.player.y;

    switch (interaction.kind) {
      case 'plant': {
        const cropKey = this.forcedSeed ?? preferredSeed(farm);
        if (!cropKey) return;
        audio.plant();
        this.player.swing();
        const r = await apiPost<ActionReply>('/act/plant', {
          plotIndex: interaction.target,
          cropKey,
        });
        this.effects.dust(px, py);
        this.commit(r, px, py);
        break;
      }

      case 'harvest': {
        this.player.swing();
        const r = await apiPost<ActionReply>('/act/harvest', { plotIndex: interaction.target });
        audio.harvest();
        this.effects.burst(px, py - 20, COLORS.leaf, 12);
        if (r.xp) this.effects.float(px, py - 30, `+${r.xp} XP`, '#9fe8ff');
        this.commit(r, px, py);
        break;
      }

      case 'chop':
      case 'mine': {
        const endpoint = interaction.kind === 'chop' ? '/act/chop' : '/act/mine';
        this.player.swing();
        if (interaction.kind === 'chop') audio.chop();
        else audio.mine();

        const r = await apiPost<ActionReply>(endpoint, { nodeIndex: interaction.target });
        const slot = nodeSlotAt(Number(interaction.target));
        const nx = (slot?.x ?? 0) * TILE + TILE / 2;
        const ny = (slot?.y ?? 0) * TILE + TILE / 2;

        this.effects.dust(nx, ny, interaction.kind === 'chop' ? COLORS.wood : COLORS.stone);
        if (r.felled) {
          this.effects.burst(nx, ny, interaction.kind === 'chop' ? COLORS.wood : COLORS.stone, 16);
          for (const [key, qty] of Object.entries(r.gained ?? {})) {
            this.effects.float(nx, ny - 30, `+${qty} ${key}`, '#f5e6c8');
          }
        }
        this.commit(r, nx, ny);
        break;
      }

      case 'egg': {
        const r = await apiPost<ActionReply>('/act/collectEgg', {
          groundItemId: interaction.target,
        });
        audio.pickup();
        this.effects.float(px, py - 30, '+1 egg', '#fdf6e3');
        this.commit(r, px, py);
        break;
      }

      case 'fish': {
        this.player.swing();
        const r = await apiPost<ActionReply>('/act/fish', {});
        audio.pickup();
        const caught = r.gained?.['fish'] ?? 0;
        this.effects.burst(px, py - 20, COLORS.amber, 10);
        this.effects.float(px, py - 30, `+${caught} fish`, '#9fe8ff');
        if (r.seedGained) {
          bridge.toast('good', `You reeled in ${r.catchLabel ?? 'something rare'}.`);
        }
        this.commit(r, px, py);
        break;
      }

      case 'milk': {
        const r = await apiPost<ActionReply>('/act/collectMilk', {});
        audio.moo();
        this.effects.float(px, py - 30, '+1 milk', '#fdf6e3');
        this.commit(r, px, py);
        break;
      }

      default:
        break;
    }
  }

  /** Applies an authoritative reply and plays whatever it earned. */
  commit(reply: ActionReply, x: number, y: number): void {
    stampReceived(reply.farm);
    bridge.emit('farm', reply.farm);

    if (reply.coinsGained) {
      audio.coin();
      this.effects.flyToHud(x, y, COLORS.coin);
      this.effects.float(x, y - 46, `+${reply.coinsGained}`, '#f4d35e');
    }

    for (const level of reply.levelUps ?? []) {
      audio.levelUp();
      this.effects.pulse(x, y - 20);
      bridge.emit('levelUp', [level]);
      bridge.toast('good', `Level ${level}!`);
    }

    for (const goal of reply.daily?.completed ?? []) {
      audio.levelUp();
      this.effects.pulse(x, y - 20, 0xf4b942);
      const reward = goal.reward.amber
        ? `+${goal.reward.amber} $AMBER`
        : `+${goal.reward.coins ?? 0} coins`;
      bridge.toast('good', `Daily done: ${goal.text} ${reward}`);
    }

    if (reply.daily?.dayComplete) {
      const d = reply.daily.dayComplete;
      audio.amber();
      this.effects.flyToHud(x, y, COLORS.amber);
      bridge.toast(
        'good',
        `All daily goals cleared — ${d.streak}-day streak, +${d.amber} $AMBER and +${d.coins} coins.`,
      );
    }

    for (const lr of reply.levelRewards ?? []) {
      const parts: string[] = [];
      if (lr.reward.coins) parts.push(`+${lr.reward.coins} coins`);
      if (lr.reward.amber) parts.push(`+${lr.reward.amber} $AMBER`);
      if (lr.reward.note) parts.push(lr.reward.note);
      if (parts.length > 0) bridge.toast('good', `Level ${lr.level}: ${parts.join(' · ')}`);
    }

    if (reply.questCompleted) {
      const q = reply.questCompleted;
      this.effects.pulse(x, y - 20, 0x9fe8ff);
      const reward = q.reward.amber
        ? `+${q.reward.amber} $AMBER`
        : q.reward.coins
          ? `+${q.reward.coins} coins`
          : '';
      bridge.toast('good', `Quest complete: ${q.text} ${reward}`.trim());
      if (q.reward.amber) {
        audio.amber();
        this.effects.flyToHud(x, y, COLORS.amber);
      }
    }
  }

  private handleFailure(err: unknown): void {
    audio.error();
    if (!(err instanceof ApiRequestError)) {
      bridge.toast('bad', 'Could not reach the farm.');
      return;
    }

    const remainingMs = err.payload['remainingMs'];
    if (err.code === 'NOT_READY' && typeof remainingMs === 'number') {
      this.effects.float(
        this.player.x,
        this.player.y - 40,
        `${Math.ceil(remainingMs / 1000)}s`,
        '#9fe8ff',
      );
      return;
    }

    // TOO_FAST is a double-submit guard firing; it is not worth a toast.
    if (err.code === 'TOO_FAST') return;
    if (err.code === 'RATE_LIMITED') {
      bridge.toast('warn', 'Slow down a moment.');
      return;
    }

    bridge.toast('warn', err.message);
  }
}

/**
 * Records when a snapshot arrived, so timers can extrapolate from the server's
 * clock rather than the browser's.
 */
export function stampReceived(farm: FarmState): void {
  farm.__receivedAt = Date.now();
}
