'use client';

import { useEffect, useState } from 'react';
import { DELIVERIES, DELIVERY_NPCS, EXPANSIONS, type ExpansionZone } from '@ambervale/game-config';
import { bridge } from '@/game/bridge';
import { ApiRequestError, apiPost, type FarmState } from '@/lib/api';
import { audio } from '@/lib/audio';
import Modal from './Modal';

interface DeliverReply {
  farm: FarmState;
  amberGained?: number;
  repGained?: number;
  levelUps?: number[];
  replayed?: boolean;
  questCompleted?: { text: string; reward: { coins?: number; amber?: number } } | null;
}

function commit(reply: DeliverReply): void {
  reply.farm.__receivedAt = Date.now();
  bridge.emit('farm', reply.farm);
  for (const level of reply.levelUps ?? []) {
    audio.levelUp();
    bridge.toast('good', `Level ${level}!`);
  }
  if (reply.questCompleted) bridge.toast('good', `Quest complete: ${reply.questCompleted.text}`);
}

/** Live countdown for a completed slot's refill. */
function Countdown({ until }: { until: number }) {
  const [left, setLeft] = useState(Math.max(0, until - Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => setLeft(Math.max(0, until - Date.now())), 250);
    return () => window.clearInterval(id);
  }, [until]);
  return <span>New order in {Math.ceil(left / 1000)}s</span>;
}

export function DeliveriesModal({ onClose }: { onClose: () => void }) {
  const [farm, setFarm] = useState<FarmState | null>(bridge.farm);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => bridge.on('farm', setFarm), []);
  if (!farm) return null;

  const locked = farm.user.level < DELIVERIES.unlockLv;

  const deliver = async (slot: number) => {
    setBusy(slot);
    try {
      // A fresh key per attempt, reused on retry, so a lost response can be
      // safely retried without paying twice.
      const idempotencyKey = crypto.randomUUID();
      const r = await apiPost<DeliverReply>('/act/deliver', { slot, idempotencyKey });
      commit(r);
      if (r.amberGained) {
        audio.amber();
        bridge.toast('good', `+${r.amberGained} $AMBER · +${r.repGained} rep`);
      }
    } catch (err) {
      audio.error();
      bridge.toast('warn', err instanceof ApiRequestError ? err.message : 'Delivery failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Delivery board" onClose={onClose}>
      <div className="rep">
        <span>Reputation</span>
        <b>{farm.user.rep}</b>
      </div>

      {locked ? (
        <p className="empty">
          The board opens at level {DELIVERIES.unlockLv}. You are level {farm.user.level}.
        </p>
      ) : (
        <ul className="slots">
          {farm.deliverySlots.map((slot) => {
            const npc = DELIVERY_NPCS[slot.npc % DELIVERY_NPCS.length]!;
            const have = slot.itemKey ? (farm.inventory[slot.itemKey] ?? 0) : 0;
            const need = slot.qty ?? 0;
            const enough = have >= need;

            return (
              <li key={slot.slot}>
                <div className="who">
                  <span
                    className="avatar"
                    style={{ background: `#${npc.tint.toString(16).padStart(6, '0')}` }}
                    aria-hidden
                  >
                    {npc.name[0]}
                  </span>
                  <b>{npc.name}</b>
                </div>

                {slot.unlocked && slot.state === 'open' && slot.line && (
                  <p className="line">&ldquo;{slot.line}&rdquo;</p>
                )}

                {!slot.unlocked ? (
                  <div className="body">
                    <span className="muted">Needs {slot.repRequired} reputation</span>
                    <div className="bar">
                      <div
                        className="fill"
                        style={{
                          width: `${Math.min(100, (farm.user.rep / slot.repRequired) * 100)}%`,
                        }}
                      />
                    </div>
                    <small>
                      {farm.user.rep}/{slot.repRequired}
                    </small>
                  </div>
                ) : slot.state === 'done' ? (
                  <div className="body">
                    <span className="muted">
                      {slot.refillAt ? <Countdown until={slot.refillAt} /> : 'Filled'}
                    </span>
                  </div>
                ) : (
                  <div className="body">
                    <div className="need">
                      <span className={enough ? 'ok' : 'short'}>
                        {have}/{need}
                      </span>{' '}
                      {slot.itemKey}
                    </div>
                    <div className="pay">+{slot.amber} $AMBER</div>
                    <button
                      type="button"
                      disabled={!enough || busy !== null}
                      onClick={() => void deliver(slot.slot)}
                    >
                      {busy === slot.slot ? 'Delivering…' : 'Deliver'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <style jsx>{`
        .rep {
          display: flex;
          justify-content: space-between;
          padding: 0 0 0.8rem;
          border-bottom: 1px solid rgba(245, 230, 200, 0.12);
          margin-bottom: 0.8rem;
          font-size: 0.85rem;
        }
        .rep b {
          color: #f4b942;
        }
        .slots {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .line {
          margin: 0.15rem 0 0.5rem;
          font-size: 0.76rem;
          font-style: italic;
          opacity: 0.68;
          line-height: 1.45;
        }
        .slots li {
          padding: 0.7rem 0.8rem;
          border-radius: 12px;
          background: rgba(245, 230, 200, 0.07);
        }
        .who {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .avatar {
          width: 1.7rem;
          height: 1.7rem;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: #10222b;
          font-weight: 700;
          font-size: 0.8rem;
        }
        .body {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .need {
          text-transform: capitalize;
          font-size: 0.9rem;
        }
        .ok {
          color: #9fe0a4;
          font-weight: 700;
        }
        .short {
          color: #f2a09a;
          font-weight: 700;
        }
        .pay {
          margin-left: auto;
          color: #f4b942;
          font-weight: 700;
          font-size: 0.85rem;
        }
        .muted {
          opacity: 0.7;
          font-size: 0.82rem;
        }
        .bar {
          flex: 1;
          height: 5px;
          border-radius: 3px;
          background: rgba(245, 230, 200, 0.18);
          overflow: hidden;
          min-width: 5rem;
        }
        .fill {
          height: 100%;
          background: #f4b942;
        }
        button {
          padding: 0.45rem 0.9rem;
          border: 0;
          border-radius: 9px;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
          font-size: 0.82rem;
        }
        button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .empty {
          opacity: 0.7;
          text-align: center;
          padding: 1.5rem 0;
        }
      `}</style>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function ExpandModal({ onClose }: { onClose: () => void }) {
  const [farm, setFarm] = useState<FarmState | null>(bridge.farm);
  const [busy, setBusy] = useState(false);

  useEffect(() => bridge.on('farm', setFarm), []);
  if (!farm) return null;

  // The two meadows are bought in order, so the sheet always shows the next
  // one rather than making the player choose between a gate and a purchase.
  const zone: ExpansionZone = farm.expansion['north'] ? 'east' : 'north';
  const def = EXPANSIONS[zone];
  const owned = farm.expansion[zone] === true;
  const amberNeeded = 'amber' in def ? def.amber : 0;

  const cost = [
    { key: 'coins', need: def.coins, have: farm.user.coins },
    { key: 'wood', need: def.wood, have: farm.inventory['wood'] ?? 0 },
    { key: 'stone', need: def.stone, have: farm.inventory['stone'] ?? 0 },
    ...(amberNeeded ? [{ key: '$AMBER', need: amberNeeded, have: farm.user.amberBalance }] : []),
  ];
  const affordable = cost.every((c) => c.have >= c.need);
  const levelShort = 'unlockLv' in def && farm.user.level < def.unlockLv;

  const expand = async () => {
    setBusy(true);
    try {
      const r = await apiPost<DeliverReply>('/act/expand', { zone });
      commit(r);
      bridge.toast('good', `The ${zone} meadow is yours — ${def.plotsAdded} new plots.`);
      onClose();
    } catch (err) {
      audio.error();
      bridge.toast('warn', err instanceof ApiRequestError ? err.message : 'Could not expand.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={zone === 'north' ? 'North meadow' : 'East meadow'} onClose={onClose}>
      {owned ? (
        <p className="empty">Every meadow in the vale is already yours.</p>
      ) : (
        <>
          <p className="lead">
            Clear the {zone} meadow for {def.plotsAdded} more plots and {def.xp} XP.
          </p>
          <ul className="cost">
            {cost.map((c) => (
              <li key={c.key} data-short={c.have < c.need}>
                <span>{c.key}</span>
                <b>
                  {c.have}/{c.need}
                </b>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!affordable || levelShort || busy}
            onClick={() => void expand()}
          >
            {levelShort
              ? `Opens at level ${'unlockLv' in def ? def.unlockLv : ''}`
              : busy
                ? 'Clearing…'
                : 'Claim the meadow'}
          </button>
        </>
      )}

      <style jsx>{`
        .lead {
          margin: 0 0 1rem;
          opacity: 0.85;
          font-size: 0.9rem;
        }
        .cost {
          list-style: none;
          margin: 0 0 1.1rem;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .cost li {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0.7rem;
          border-radius: 10px;
          background: rgba(245, 230, 200, 0.07);
          text-transform: capitalize;
        }
        .cost li[data-short='true'] b {
          color: #f2a09a;
        }
        .cost li[data-short='false'] b {
          color: #9fe0a4;
        }
        button {
          width: 100%;
          padding: 0.85rem;
          border: 0;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.45;
          cursor: default;
        }
        .empty {
          opacity: 0.75;
          text-align: center;
          padding: 1.5rem 0;
        }
      `}</style>
    </Modal>
  );
}
