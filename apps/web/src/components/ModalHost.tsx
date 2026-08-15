'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CROPS,
  CROP_KEYS,
  saleQuote,
  sellPrice,
  type CropKey,
  type ItemKey,
} from '@ambervale/game-config';
import { bridge } from '@/game/bridge';
import { TUTORIAL, TUTORIAL_DONE } from '@/game/tutorial';
import { apiPost } from '@/lib/api';
import { audio } from '@/lib/audio';
import { DeliveriesModal, ExpandModal } from './DeliveriesModal';
import { AwayModal, DailyModal, MillModal, UpgradesPanel } from './EconomyModals';
import { LeaderboardModal, ValeFundPanel } from './SocialModals';
import Modal from './Modal';
import WalletPanel from './WalletPanel';
import { commit, reportError, useFarm, type ActionReply } from './farmState';

// ---------------------------------------------------------------------------

function MarketModal({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  const [tab, setTab] = useState<'buy' | 'sell' | 'upgrades'>('buy');
  const [busy, setBusy] = useState(false);

  if (!farm) return null;

  const buy = async (cropKey: CropKey, qty: 1 | 5) => {
    setBusy(true);
    try {
      commit(await apiPost<ActionReply>('/act/buySeed', { cropKey, qty }));
      audio.coin();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const sell = async (itemKey: ItemKey) => {
    setBusy(true);
    try {
      const r = await apiPost<ActionReply>('/act/sell', { itemKey, qty: 'all' });
      commit(r);
      audio.coin();
      if (r.coinsGained) bridge.toast('good', `Sold for ${r.coinsGained} coins`);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const sellable = Object.entries(farm.inventory).filter(([, qty]) => qty > 0) as [
    ItemKey,
    number,
  ][];

  // Prices come from the server, which is the only thing that knows how far
  // this player has depressed each good. game-config's list price is used only
  // as a fallback for a snapshot that predates the field, never as the truth.
  const marketOf = (key: ItemKey) => farm.prices?.find((p) => p.itemKey === key);
  const priceOf = (key: ItemKey): number =>
    marketOf(key)?.price ?? Math.round(sellPrice(key) * farm.effects.sell);
  const glut = (key: ItemKey): boolean => (marketOf(key)?.multiplier ?? 1) < 0.97;

  /**
   * What "sell all" will actually pay.
   *
   * Not `price × qty`: the sale itself pushes the price down as it goes, so
   * quoting the current unit price would overstate every bulk sale and the
   * player would watch the number arrive short every single time.
   */
  const estimate = (key: ItemKey, qty: number): number => {
    const m = marketOf(key);
    if (!m) return Math.round(sellPrice(key) * qty * farm.effects.sell);
    const start = Math.max(0, 1 / Math.max(m.multiplier, 1e-6) - 1);
    return Math.round(m.base * qty * saleQuote(start, qty).multiplier * farm.effects.sell);
  };

  const recovers = (key: ItemKey): string | null => {
    const at = marketOf(key)?.recoversAt;
    if (!at) return null;
    const mins = Math.ceil((at - Date.now()) / 60000);
    return mins > 0 ? `${mins} min` : null;
  };

  return (
    <Modal title="Market" onClose={onClose}>
      <div className="tabs">
        <button type="button" data-on={tab === 'buy'} onClick={() => setTab('buy')}>
          Buy seeds
        </button>
        <button type="button" data-on={tab === 'sell'} onClick={() => setTab('sell')}>
          Sell
        </button>
        <button type="button" data-on={tab === 'upgrades'} onClick={() => setTab('upgrades')}>
          Upgrades
        </button>
      </div>

      {tab === 'upgrades' ? (
        <>
          <ValeFundPanel />
          <UpgradesPanel />
        </>
      ) : tab === 'buy' ? (
        <ul className="rows">
          {CROP_KEYS.map((key) => {
            const crop = CROPS[key];
            const locked = farm.user.level < crop.unlockLv;
            return (
              <li key={key} data-locked={locked}>
                <div className="name">
                  <b>{key}</b>
                  <small>
                    {locked
                      ? `Unlocks at level ${crop.unlockLv}`
                      : `${crop.seedCost} coins · grows ${Math.round(
                          crop.growSec * farm.effects.growth,
                        )}s · sells ${priceOf(key)}`}
                  </small>
                </div>
                <div className="actions">
                  <span className="have">×{farm.seeds[key] ?? 0}</span>
                  <button
                    type="button"
                    disabled={locked || busy || farm.user.coins < crop.seedCost}
                    onClick={() => void buy(key, 1)}
                  >
                    ×1
                  </button>
                  <button
                    type="button"
                    disabled={locked || busy || farm.user.coins < crop.seedCost * 5}
                    onClick={() => void buy(key, 5)}
                  >
                    ×5
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : sellable.length === 0 ? (
        <p className="empty">Your bag is empty. Harvest something first.</p>
      ) : (
        <ul className="rows">
          {sellable.map(([key, qty]) => (
            <li key={key}>
              <div className="name">
                <b>{key}</b>
                <small>
                  {priceOf(key)} coins each · {qty} in bag
                  {farm.effects.sell > 1 && <em> (cellar)</em>}
                </small>
                {/*
                  A sagging price has to say so here, or the mechanic is only
                  ever met as coins that came out lower than expected.
                */}
                {glut(key) && (
                  <small className="glut">
                    ▼ {Math.round((1 - (marketOf(key)?.multiplier ?? 1)) * 100)}% — you have sold a
                    lot of these lately
                    {recovers(key) ? `, worth selling again in ${recovers(key)}` : ''}
                  </small>
                )}
              </div>
              <div className="actions">
                <button type="button" disabled={busy} onClick={() => void sell(key)}>
                  Sell all ({estimate(key, qty)})
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .glut {
          display: block;
          margin-top: 0.15rem;
          color: #f2a09a;
          font-size: 0.72rem;
        }
        .tabs {
          display: flex;
          gap: 0.4rem;
          margin-bottom: 0.9rem;
        }
        .tabs button {
          flex: 1;
          padding: 0.55rem;
          border-radius: 10px;
          border: 1px solid rgba(245, 230, 200, 0.2);
          background: transparent;
          color: #f5e6c8;
          cursor: pointer;
          font-weight: 600;
        }
        .tabs button[data-on='true'] {
          background: #f4b942;
          color: #2a1a05;
          border-color: transparent;
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
        .actions {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .have {
          opacity: 0.65;
          font-size: 0.78rem;
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

function BagModal({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  if (!farm) return null;

  const items = Object.entries(farm.inventory).filter(([, qty]) => qty > 0);
  const seeds = Object.entries(farm.seeds).filter(([, qty]) => qty > 0);

  return (
    <Modal title="Bag" onClose={onClose}>
      <h3>Harvest &amp; goods</h3>
      {items.length === 0 ? (
        <p className="empty">Nothing yet.</p>
      ) : (
        <div className="grid">
          {items.map(([key, qty]) => (
            <div key={key} className="cell">
              <b>{key}</b>
              <span>×{qty}</span>
              <small>{sellPrice(key as ItemKey)} ea</small>
            </div>
          ))}
        </div>
      )}

      <h3>Seeds</h3>
      {seeds.length === 0 ? (
        <p className="empty">No seeds — buy some at the market.</p>
      ) : (
        <div className="grid">
          {seeds.map(([key, qty]) => (
            <div key={key} className="cell">
              <b>{key}</b>
              <span>×{qty}</span>
              <small>seed</small>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        h3 {
          margin: 0.4rem 0 0.6rem;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.6;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .cell {
          padding: 0.65rem 0.5rem;
          border-radius: 12px;
          background: rgba(245, 230, 200, 0.07);
          text-align: center;
        }
        .cell b {
          display: block;
          text-transform: capitalize;
          font-size: 0.82rem;
        }
        .cell span {
          display: block;
          font-weight: 700;
          color: #f4b942;
        }
        .cell small {
          opacity: 0.6;
          font-size: 0.68rem;
        }
        .empty {
          opacity: 0.65;
          margin: 0 0 1rem;
        }
      `}</style>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

/**
 * The wallet, on its own.
 *
 * `WalletPanel` already did the linking; it just lived inside Settings, where
 * it sat under the sound toggle and above "reset run" — three unrelated things
 * in one drawer, only one of which decides whether a farm survives a cleared
 * browser.
 */
function WalletModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Wallet" onClose={onClose}>
      <p className="blurb">
        Linking a wallet makes this farm yours rather than this browser&apos;s. It moves nothing and
        grants nothing in game — it is an identity, so a cleared browser or a new device can get the
        same farm back.
      </p>
      <WalletPanel />
      <style jsx>{`
        .blurb {
          margin: 0 0 1rem;
          font-size: 0.88rem;
          line-height: 1.6;
          opacity: 0.78;
        }
      `}</style>
    </Modal>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  const [muted, setMuted] = useState(audio.isMuted);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * Where the tutorial stands, in words.
   *
   * Worth saying out loud rather than only offering a button: someone who
   * skipped it months ago has no way to tell whether the game has a tutorial
   * at all, and that is exactly the question this row exists to answer.
   */
  const step = farm?.user.tutorialStep ?? 0;
  const tutorialState =
    step === TUTORIAL_DONE
      ? 'Skipped'
      : step >= TUTORIAL.length
        ? 'Finished'
        : `Step ${step + 1} of ${TUTORIAL.length}`;
  const running = step !== TUTORIAL_DONE && step < TUTORIAL.length;

  const replay = async () => {
    setBusy(true);
    try {
      commit(await apiPost<ActionReply>('/tutorial/restart', {}));
      bridge.toast('info', 'Tutorial restarted. Follow the marker.');
      onClose();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    audio.setMuted(next);
    setMuted(next);
  };

  const reset = async () => {
    setBusy(true);
    try {
      const r = await apiPost<ActionReply>('/run/reset', {});
      commit(r);
      bridge.toast('info', 'Run reset. Fresh farm, fresh start.');
      onClose();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="row">
        <span>Sound</span>
        <button type="button" onClick={toggleMute}>
          {muted ? 'Muted' : 'On'}
        </button>
      </div>
      <div className="row">
        <span>
          Tutorial
          <em className="state">{tutorialState}</em>
        </span>
        <button type="button" disabled={busy} onClick={() => void replay()}>
          {running ? 'Restart' : 'Replay'}
        </button>
      </div>
      <div className="row danger">
        <span>Reset run</span>
        {confirmReset ? (
          <span className="confirm">
            <button type="button" disabled={busy} onClick={() => void reset()}>
              {busy ? 'Resetting…' : 'Yes, wipe it'}
            </button>
            <button type="button" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmReset(true)}>
            Reset
          </button>
        )}
      </div>

      <p className="note">
        Sound preference is saved on this device. Replaying the tutorial keeps your farm exactly as
        it is — it only walks you through the ten steps again. Resetting deletes this farm — every
        plot, item and $AMBER ledger entry — and cannot be undone.
      </p>

      <style jsx>{`
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.7rem 0;
          border-bottom: 1px solid rgba(245, 230, 200, 0.1);
        }
        .state {
          display: block;
          font-style: normal;
          font-size: 0.72rem;
          opacity: 0.55;
          margin-top: 0.15rem;
        }
        .row button {
          padding: 0.45rem 1rem;
          border-radius: 9px;
          border: 1px solid rgba(245, 230, 200, 0.25);
          background: transparent;
          color: #f5e6c8;
          cursor: pointer;
          font-weight: 600;
        }
        .danger button {
          border-color: rgba(242, 160, 154, 0.6);
          color: #f2a09a;
        }
        .confirm {
          display: flex;
          gap: 0.4rem;
        }
        .note {
          margin-top: 1rem;
          font-size: 0.72rem;
          opacity: 0.6;
          line-height: 1.5;
        }
      `}</style>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

/** Routes the bridge's `modal` event to the right sheet. */
export default function ModalHost() {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => bridge.on('modal', setOpen), []);

  const close = useCallback(() => bridge.emit('modal', null), []);

  switch (open) {
    case 'market':
      return <MarketModal onClose={close} />;
    case 'bag':
      return <BagModal onClose={close} />;
    case 'deliveries':
      return <DeliveriesModal onClose={close} />;
    case 'expand':
      return <ExpandModal onClose={close} />;
    case 'mill':
      return <MillModal onClose={close} />;
    case 'daily':
      return <DailyModal onClose={close} />;
    case 'leaderboard':
      return <LeaderboardModal onClose={close} />;
    case 'away':
      return <AwayModal onClose={close} />;
    case 'wallet':
      return <WalletModal onClose={close} />;
    case 'settings':
      return <SettingsModal onClose={close} />;
    default:
      return null;
  }
}
