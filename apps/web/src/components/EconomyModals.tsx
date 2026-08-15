'use client';

/**
 * The sheets that spend rather than earn: the upgrade shop, the mill, the
 * daily goals card, and the "while you were away" summary.
 *
 * All four render straight from FarmState. Prices come down from the server in
 * `farm.shop` rather than being read out of game-config here, so a retune
 * reaches the UI on the next reply instead of on the next deploy.
 */

import { useCallback, useEffect, useState } from 'react';
import { RECIPES, RECIPE_KEYS, sellPrice, type ItemKey } from '@ambervale/game-config';
import { bridge } from '@/game/bridge';
import { guidanceForGoal } from '@/game/guidance';
import { apiPost, type FarmShopEntry, type FarmState, type FarmUpgradeCost } from '@/lib/api';
import { audio } from '@/lib/audio';
import Modal from './Modal';
import { commit, reportError, useFarm, type ActionReply } from './farmState';

/** "180 coins · 6 wood · 3 $AMBER" */
function costLabel(cost: FarmUpgradeCost): string {
  const parts: string[] = [];
  if (cost.coins) parts.push(`${cost.coins} coins`);
  for (const [item, qty] of Object.entries(cost.items ?? {})) parts.push(`${qty} ${item}`);
  if (cost.amber) parts.push(`${cost.amber} $AMBER`);
  return parts.join(' · ');
}

/** Whether the player can currently pay a cost, checked the same way the server will. */
function canAfford(farm: FarmState, cost: FarmUpgradeCost): boolean {
  if (cost.coins && farm.user.coins < cost.coins) return false;
  if (cost.amber && farm.user.amberBalance < cost.amber) return false;
  for (const [item, qty] of Object.entries(cost.items ?? {})) {
    if ((farm.inventory[item] ?? 0) < qty) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Upgrades — the sink
// ---------------------------------------------------------------------------

export function UpgradesPanel() {
  const farm = useFarm();
  const [busy, setBusy] = useState<string | null>(null);

  if (!farm) return null;

  const buy = async (entry: FarmShopEntry) => {
    setBusy(entry.key);
    try {
      const r = await apiPost<ActionReply>('/act/upgrade', { key: entry.key });
      commit(r);
      audio.coin();
      bridge.toast('good', `${entry.name} — ${entry.next?.effect ?? 'upgraded'}`);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  // Only worth saying once, and only when a tier in front of the player
  // actually costs $AMBER.
  const anyAmberCost = farm.shop.some((e) => (e.next?.cost.amber ?? 0) > 0);

  return (
    <>
      {anyAmberCost && (
        <p className="amberNote">
          Tiers priced in $AMBER spend it permanently. There is no on-chain claim today.
        </p>
      )}
      <ul className="rows">
        {farm.shop.map((entry) => {
          const locked = farm.user.level < entry.unlockLv;
          const maxed = entry.next === null;
          const affordable = entry.next ? canAfford(farm, entry.next.cost) : false;

          return (
            <li key={entry.key} data-locked={locked}>
              <div className="name">
                <b>
                  {entry.name}
                  {entry.tier > 0 && <span className="tier">tier {entry.tier}</span>}
                </b>
                <small>{entry.effect ?? entry.blurb}</small>
                {!locked && entry.next && <small className="next">→ {entry.next.effect}</small>}
              </div>
              <div className="actions">
                {locked ? (
                  <span className="note">Level {entry.unlockLv}</span>
                ) : maxed ? (
                  <span className="note">Maxed</span>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null || !affordable}
                    onClick={() => void buy(entry)}
                  >
                    {costLabel(entry.next!.cost)}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <style jsx>{`
        .amberNote {
          margin: 0 0 0.7rem;
          padding: 0.5rem 0.7rem;
          border-radius: 10px;
          background: rgba(242, 160, 154, 0.12);
          border: 1px solid rgba(242, 160, 154, 0.32);
          color: #f2a09a;
          font-size: 0.72rem;
          line-height: 1.45;
        }
        .rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .rows li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.65rem 0.75rem;
          border-radius: 12px;
          background: rgba(245, 230, 200, 0.07);
        }
        .rows li[data-locked='true'] {
          opacity: 0.45;
        }
        .name b {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.9rem;
        }
        .tier {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          background: rgba(244, 185, 66, 0.22);
          color: #f4b942;
        }
        .name small {
          display: block;
          opacity: 0.7;
          font-size: 0.72rem;
          line-height: 1.35;
          max-width: 22rem;
        }
        .name .next {
          color: #9fe8ff;
          opacity: 0.85;
        }
        .actions button {
          padding: 0.5rem 0.75rem;
          border-radius: 9px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
          font-size: 0.76rem;
          white-space: nowrap;
        }
        .actions button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .note {
          font-size: 0.72rem;
          opacity: 0.6;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// The mill
// ---------------------------------------------------------------------------

export function MillModal({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  const [busy, setBusy] = useState<string | null>(null);

  if (!farm) return null;

  const craft = async (recipe: string, times: number) => {
    setBusy(recipe);
    try {
      const r = await apiPost<ActionReply>('/act/craft', { recipe, times });
      commit(r);
      audio.harvest();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  if (!farm.effects.canCraft) {
    return (
      <Modal title="The mill" onClose={onClose}>
        <p className="empty">
          The sails turn, but there is no millstone under them. Buy one from the market&apos;s
          upgrades and this becomes the most profitable building on the farm.
        </p>
        <button type="button" className="link" onClick={() => bridge.emit('modal', 'market')}>
          Open the market
        </button>
        <style jsx>{`
          .empty {
            opacity: 0.75;
            line-height: 1.55;
            margin: 0.5rem 0 1rem;
          }
          .link {
            width: 100%;
            padding: 0.6rem;
            border-radius: 10px;
            border: 0;
            background: #f4b942;
            color: #2a1a05;
            font-weight: 700;
            cursor: pointer;
          }
        `}</style>
      </Modal>
    );
  }

  return (
    <Modal title="The mill" onClose={onClose}>
      <ul className="rows">
        {RECIPE_KEYS.map((key) => {
          const recipe = RECIPES[key];
          const locked = farm.user.level < recipe.unlockLv;

          // How many the bag can actually make right now.
          const possible = Math.min(
            10,
            ...Object.entries(recipe.inputs).map(([item, qty]) =>
              Math.floor((farm.inventory[item] ?? 0) / (qty as number)),
            ),
          );

          const inputValue = Object.entries(recipe.inputs).reduce(
            (sum, [item, qty]) => sum + sellPrice(item as ItemKey) * (qty as number),
            0,
          );
          const margin = sellPrice(recipe.output) - inputValue;

          return (
            <li key={key} data-locked={locked}>
              <div className="name">
                <b>{recipe.output}</b>
                <small>
                  {Object.entries(recipe.inputs)
                    .map(([item, qty]) => `${qty} ${item}`)
                    .join(' + ')}{' '}
                  → 1 {recipe.output}
                </small>
                <small className="margin">
                  {locked
                    ? `Unlocks at level ${recipe.unlockLv}`
                    : `sells ${sellPrice(recipe.output)} · +${margin} over the parts`}
                </small>
              </div>
              <div className="actions">
                <button
                  type="button"
                  disabled={locked || busy !== null || possible < 1}
                  onClick={() => void craft(key, 1)}
                >
                  Mill
                </button>
                <button
                  type="button"
                  disabled={locked || busy !== null || possible < 2}
                  onClick={() => void craft(key, possible)}
                >
                  ×{Math.max(possible, 0)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <style jsx>{`
        .rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .rows li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.6rem 0.75rem;
          border-radius: 12px;
          background: rgba(245, 230, 200, 0.07);
        }
        .rows li[data-locked='true'] {
          opacity: 0.45;
        }
        .name b {
          text-transform: capitalize;
        }
        .name small {
          display: block;
          opacity: 0.7;
          font-size: 0.72rem;
        }
        .margin {
          color: #9fe8ff;
        }
        .actions {
          display: flex;
          gap: 0.4rem;
        }
        .actions button {
          padding: 0.45rem 0.7rem;
          border-radius: 9px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .actions button:disabled {
          opacity: 0.4;
          cursor: default;
        }
      `}</style>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Daily goals
// ---------------------------------------------------------------------------

/** "4h 12m" until the next reset. */
function untilReset(resetAt: number): string {
  const ms = Math.max(0, resetAt - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function DailyModal({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  const [, force] = useState(0);

  // The countdown is the only live thing on this sheet.
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!farm) return null;
  const daily = farm.daily;

  return (
    <Modal title="Today" onClose={onClose}>
      <div className="head">
        <span className="reset">Resets in {untilReset(daily.resetAt)}</span>
        {daily.streak > 0 && <span className="streak">🔥 {daily.streak}-day streak</span>}
      </div>

      <ul className="rows">
        {daily.goals.map((goal) => {
          // Rewards are paid the moment a goal is met, so there is nothing to
          // claim — the useful button is the one that answers "where?".
          const guide = goal.done ? null : guidanceForGoal(goal.id, farm);
          const reward = goal.reward.amber
            ? `${goal.reward.amber} $AMBER`
            : `${goal.reward.coins ?? 0} coins`;

          return (
            <li key={goal.id} data-done={goal.done}>
              <div className="name">
                <b>{goal.text}</b>
                <small>{goal.done ? `${reward} paid` : reward}</small>
                {guide?.hint && <em className="hint">{guide.hint}</em>}
              </div>
              <div className="progress">
                <div className="bar">
                  <div
                    className="fill"
                    style={{ width: `${Math.min(100, (goal.current / goal.target) * 100)}%` }}
                  />
                </div>
                <span>{goal.done ? '✓ Done' : `${goal.current}/${goal.target}`}</span>
              </div>
              {guide && (
                <button type="button" className="go" onClick={guide.run}>
                  {guide.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="note">
        Rewards are paid as soon as a goal is met — there is nothing to collect. Clear all three to
        keep the streak alive. The goals are the same for everyone today, and change at midnight
        UTC.
      </p>

      <style jsx>{`
        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          font-size: 0.72rem;
        }
        .reset {
          opacity: 0.6;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .streak {
          color: #f4b942;
          font-weight: 700;
        }
        .rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .rows li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.65rem 0.75rem;
          border-radius: 12px;
          background: rgba(245, 230, 200, 0.07);
        }
        .rows li[data-done='true'] {
          background: rgba(122, 200, 130, 0.16);
        }
        .name {
          flex: 1;
          min-width: 0;
        }
        .name b {
          font-size: 0.86rem;
        }
        .name small {
          display: block;
          opacity: 0.65;
          font-size: 0.7rem;
        }
        .hint {
          display: block;
          margin-top: 0.2rem;
          font-style: normal;
          font-size: 0.68rem;
          color: #f4b942;
          opacity: 0.85;
          line-height: 1.35;
        }
        .go {
          flex: 0 0 auto;
          padding: 0.45rem 0.8rem;
          border-radius: 999px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          font-size: 0.76rem;
          cursor: pointer;
          white-space: nowrap;
        }
        .go:active {
          transform: translateY(1px);
        }
        .progress {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 7rem;
        }
        .bar {
          flex: 1;
          height: 6px;
          border-radius: 999px;
          background: rgba(245, 230, 200, 0.16);
          overflow: hidden;
        }
        .fill {
          height: 100%;
          background: #f4b942;
          transition: width 300ms ease;
        }
        .progress span {
          font-size: 0.72rem;
          font-variant-numeric: tabular-nums;
          opacity: 0.85;
          min-width: 2.2rem;
          text-align: right;
        }
        .note {
          margin-top: 1rem;
          font-size: 0.72rem;
          opacity: 0.55;
          line-height: 1.5;
        }
      `}</style>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// While you were away
// ---------------------------------------------------------------------------

function humanGap(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} minutes`;
}

/**
 * Shown once, on the read that reported it.
 *
 * The server only sends `away` on the first /farm after a gap, so this cannot
 * reappear on the next action — no client-side "seen" flag needed.
 */
export function AwayModal({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  if (!farm?.away) return null;
  const away = farm.away;

  const lines: string[] = [];
  if (away.cropsReady > 0) lines.push(`${away.cropsReady} crops finished growing`);
  if (away.eggsLaid > 0) lines.push(`${away.eggsLaid} eggs in the yard`);
  if (away.milkReady) lines.push('the cow is ready to milk');
  if (away.nodesRegrown > 0) lines.push(`${away.nodesRegrown} oaks and rocks came back`);
  if (away.ordersRefreshed > 0) lines.push(`${away.ordersRefreshed} new orders on the board`);

  // Kept out of the list above and given its own line: a loss reported in the
  // same breath as the good news reads as good news, and a field three plots
  // emptier than it was left owes the player an explanation.
  const ruined = away.cropsRuined ?? 0;

  return (
    <Modal title="While you were away" onClose={onClose}>
      <p className="gap">You were gone {humanGap(away.awayMs)}.</p>
      <ul className="lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {ruined > 0 && (
        <p className="loss">
          Crows took {ruined} {ruined === 1 ? 'crop' : 'crops'} that were left standing. A scarecrow
          buys more time.
        </p>
      )}
      <button type="button" className="go" onClick={onClose}>
        Back to work
      </button>

      <style jsx>{`
        .loss {
          margin: 0.9rem 0 0;
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          background: rgba(242, 160, 154, 0.12);
          border: 1px solid rgba(242, 160, 154, 0.3);
          color: #f2a09a;
          font-size: 0.82rem;
          line-height: 1.45;
        }
        .gap {
          margin: 0 0 0.75rem;
          opacity: 0.7;
          font-size: 0.85rem;
        }
        .lines {
          list-style: none;
          margin: 0 0 1.2rem;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .lines li {
          padding: 0.6rem 0.8rem;
          border-radius: 12px;
          background: rgba(244, 185, 66, 0.12);
          border: 1px solid rgba(244, 185, 66, 0.22);
          font-size: 0.88rem;
        }
        .lines li::first-letter {
          text-transform: uppercase;
        }
        .go {
          width: 100%;
          padding: 0.7rem;
          border-radius: 12px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
        }
      `}</style>
    </Modal>
  );
}

/**
 * Opens the away sheet the moment a report arrives.
 *
 * Mounted next to the modal host rather than inside it, because the trigger is
 * the arrival of state, not a player pressing anything.
 */
export function AwayWatcher() {
  const opened = useState(() => new Set<number>())[0];

  const onFarm = useCallback(
    (farm: FarmState) => {
      if (!farm.away || !bridge.started) return;
      // A report is identified by the gap it describes; the server sends each
      // one exactly once, and this guards a double-emit of the same snapshot.
      const id = farm.away.awayMs;
      if (opened.has(id)) return;
      opened.add(id);
      bridge.emit('modal', 'away');
    },
    [opened],
  );

  useEffect(() => bridge.on('farm', onFarm), [onFarm]);
  return null;
}
