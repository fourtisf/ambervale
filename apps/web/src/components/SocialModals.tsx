'use client';

/**
 * The parts of the game that involve anybody else: the leaderboard, and the
 * Vale Fund that feeds it.
 *
 * Until now nothing in AMBERVALE acknowledged that other players existed,
 * which for a game with a token in it is a strange thing to leave out — a
 * score with nothing to compare it against is not a score.
 */

import { useCallback, useEffect, useState } from 'react';
import { PATRONAGE } from '@ambervale/game-config';
import { bridge } from '@/game/bridge';
import { apiPost, fetchLeaderboard, type BoardRow, type Leaderboard } from '@/lib/api';
import { audio } from '@/lib/audio';
import Modal from './Modal';
import { commit, reportError, useFarm, type ActionReply } from './farmState';

type Board = 'renown' | 'level' | 'streak';

const BOARD_LABEL: Record<Board, string> = {
  renown: 'Renown',
  level: 'Level',
  streak: 'Streak',
};

function statFor(board: Board, row: BoardRow): string {
  if (board === 'renown') return String(row.renown);
  if (board === 'level') return `Lv ${row.level}`;
  return `${row.streak}d`;
}

export function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [board, setBoard] = useState<Board>('renown');
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const slug = bridge.farm?.user.visitSlug ?? null;
  const copyLink = useCallback(async () => {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/v/${slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      bridge.toast('warn', `Your link: ${window.location.origin}/v/${slug}`);
    }
  }, [slug]);

  useEffect(() => {
    let live = true;
    void fetchLeaderboard()
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  const rows = data?.[board] ?? [];

  return (
    <Modal title="The Vale" onClose={onClose}>
      {slug && (
        <div className="share">
          <div className="sharetext">
            <b>Your farm has an address</b>
            <small>Anyone in the vale can walk your fields and sign your gate book.</small>
          </div>
          <button type="button" onClick={() => void copyLink()}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
      )}

      {data && (
        <p className="count">
          <b>{data.activeToday}</b> {data.activeToday === 1 ? 'farmer' : 'farmers'} tended the vale
          today · {data.totalFarms} farms in all
        </p>
      )}

      <div className="tabs">
        {(Object.keys(BOARD_LABEL) as Board[]).map((key) => (
          <button key={key} type="button" data-on={board === key} onClick={() => setBoard(key)}>
            {BOARD_LABEL[key]}
          </button>
        ))}
      </div>

      {error ? (
        <p className="empty">Could not reach the vale just now.</p>
      ) : !data ? (
        <p className="empty">Reading the ledger…</p>
      ) : rows.length === 0 ? (
        <p className="empty">Nobody has earned a place here yet. It could be you.</p>
      ) : (
        <ol className="rows">
          {rows.map((row, i) => (
            <li key={row.handle} data-you={row.you ? 'true' : 'false'}>
              <span className="rank">{i + 1}</span>
              <span className="who">
                <b>{row.handle}</b>
                {row.title && <small>{row.title}</small>}
              </span>
              <span className="stat">{statFor(board, row)}</span>
            </li>
          ))}
        </ol>
      )}

      {data && (
        <p className="you">
          You are <b>{data.you.handle}</b>
          {data.you.renownRank !== null
            ? ` — ranked #${data.you.renownRank} by renown`
            : ' — give to the Vale Fund to take a rank'}
        </p>
      )}

      <style jsx>{`
        .share {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin: 0 0 0.9rem;
          padding: 0.65rem 0.8rem;
          border-radius: 12px;
          background: rgba(159, 232, 255, 0.08);
          border: 1px solid rgba(159, 232, 255, 0.25);
        }
        .sharetext b {
          display: block;
          font-size: 0.84rem;
        }
        .sharetext small {
          font-size: 0.7rem;
          opacity: 0.72;
          line-height: 1.4;
        }
        .share button {
          flex: 0 0 auto;
          padding: 0.5rem 0.85rem;
          border-radius: 999px;
          border: 0;
          background: #9fe8ff;
          color: #0a2e3d;
          font-weight: 700;
          font-size: 0.74rem;
          cursor: pointer;
          white-space: nowrap;
        }
        .count {
          margin: 0 0 0.8rem;
          font-size: 0.78rem;
          opacity: 0.75;
        }
        .count b {
          color: #f4b942;
        }
        .tabs {
          display: flex;
          gap: 0.4rem;
          margin-bottom: 0.8rem;
        }
        .tabs button {
          flex: 1;
          padding: 0.5rem;
          border-radius: 10px;
          border: 1px solid rgba(245, 230, 200, 0.2);
          background: transparent;
          color: #f5e6c8;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.82rem;
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
          gap: 0.35rem;
        }
        .rows li {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.55rem 0.75rem;
          border-radius: 11px;
          background: rgba(245, 230, 200, 0.07);
        }
        .rows li[data-you='true'] {
          background: rgba(244, 185, 66, 0.18);
          border: 1px solid rgba(244, 185, 66, 0.4);
        }
        .rank {
          width: 1.4rem;
          text-align: right;
          opacity: 0.5;
          font-variant-numeric: tabular-nums;
          font-size: 0.8rem;
        }
        .who {
          flex: 1;
          min-width: 0;
        }
        .who b {
          display: block;
          font-size: 0.84rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .who small {
          display: block;
          font-size: 0.68rem;
          color: #f4b942;
          opacity: 0.85;
        }
        .stat {
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          font-size: 0.85rem;
        }
        .empty {
          opacity: 0.7;
          text-align: center;
          padding: 1.6rem 0;
        }
        .you {
          margin: 0.9rem 0 0;
          font-size: 0.74rem;
          opacity: 0.65;
          line-height: 1.5;
        }
      `}</style>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The Vale Fund
// ---------------------------------------------------------------------------

/**
 * The endless sink.
 *
 * Every other sink in the game terminates — upgrades cap, meadows are bought
 * once — so each of them only postpones the problem it solves. This one has no
 * end, and buys nothing but rank. Making renown grant a bonus would turn the
 * only unbounded drain in the economy into unbounded advantage.
 */
export function ValeFundPanel() {
  const farm = useFarm();
  const [busy, setBusy] = useState(false);

  const give = useCallback(async (currency: 'coins' | 'amber') => {
    setBusy(true);
    try {
      const r = await apiPost<ActionReply & { renown?: number; title?: string | null }>(
        '/act/patronage',
        { currency },
      );
      commit(r);
      audio.amber();
      bridge.toast(
        'good',
        r.title ? `Renown ${r.renown} — ${r.title}` : `Renown ${r.renown ?? ''}`.trim(),
      );
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!farm) return null;

  const owned = farm.user.renown;
  const coinCost = PATRONAGE.coinCost(owned);
  const amberCost = PATRONAGE.amberCost(owned);
  const locked = farm.user.level < PATRONAGE.unlockLv;

  return (
    <div className="fund">
      <div className="head">
        <b>The Vale Fund</b>
        <span className="renown">
          {owned} renown{farm.user.title ? ` · ${farm.user.title}` : ''}
        </span>
      </div>
      <p className="blurb">
        Give to the vale for a name on the boards. Renown buys no advantage — only rank — and the
        next point always costs more than the last.
      </p>
      {/* Spending $AMBER is permanent and there is currently no way to take it
          out of the game. Saying so at the button is the only honest place:
          a disclosure in a settings panel nobody opens is not a disclosure. */}
      <p className="blurb warn">
        $AMBER spent here is gone for good. It cannot be claimed on-chain today, and there is no
        date for when it could be.
      </p>
      <div className="give">
        <button
          type="button"
          disabled={locked || busy || farm.user.coins < coinCost}
          onClick={() => void give('coins')}
        >
          {locked ? `Level ${PATRONAGE.unlockLv}` : `${coinCost} coins`}
        </button>
        <button
          type="button"
          disabled={locked || busy || farm.user.amberBalance < amberCost}
          onClick={() => void give('amber')}
        >
          {locked ? `Level ${PATRONAGE.unlockLv}` : `${amberCost} $AMBER`}
        </button>
      </div>

      <style jsx>{`
        .fund {
          margin-bottom: 0.9rem;
          padding: 0.75rem 0.85rem;
          border-radius: 12px;
          background: rgba(244, 185, 66, 0.1);
          border: 1px solid rgba(244, 185, 66, 0.28);
        }
        .head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .head b {
          font-size: 0.9rem;
        }
        .renown {
          font-size: 0.72rem;
          color: #f4b942;
          font-weight: 700;
        }
        .blurb {
          margin: 0.3rem 0 0.6rem;
          font-size: 0.72rem;
          opacity: 0.7;
          line-height: 1.45;
        }
        .warn {
          color: #f2a09a;
          opacity: 0.9;
        }
        .give {
          display: flex;
          gap: 0.4rem;
        }
        .give button {
          flex: 1;
          padding: 0.5rem;
          border-radius: 9px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
          font-size: 0.78rem;
        }
        .give button:disabled {
          opacity: 0.4;
          cursor: default;
        }
      `}</style>
    </div>
  );
}
