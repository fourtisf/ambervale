'use client';

import { useEffect, useState } from 'react';
import { bridge } from '@/game/bridge';
import type { FarmState } from '@/lib/api';

/** Level ring: an SVG arc showing XP progress into the current level. */
function LevelRing({ level, progress }: { level: number; progress: number }) {
  const r = 17;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(245,230,200,0.2)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="#9fe8ff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, progress)))}
          transform="rotate(-90 22 22)"
          style={{ transition: 'stroke-dashoffset 420ms ease' }}
        />
      </svg>
      <span>{level}</span>
      <style jsx>{`
        .ring {
          position: relative;
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
        }
        .ring span {
          position: absolute;
          font-size: 0.85rem;
          font-weight: 700;
          color: #f5e6c8;
        }
      `}</style>
    </div>
  );
}

export default function Hud({ onOpen }: { onOpen: (modal: string) => void }) {
  const [farm, setFarm] = useState<FarmState | null>(bridge.farm);

  useEffect(() => bridge.on('farm', setFarm), []);

  if (!farm) return null;

  const { user, quest } = farm;
  const xpProgress = user.xpForNext > 0 ? user.xpIntoLevel / user.xpForNext : 0;

  return (
    <div className="hud">
      <div className="stats">
        <LevelRing level={user.level} progress={xpProgress} />
        <div className="pill">
          <span className="dot coin" />
          {user.coins}
        </div>
        <div className="pill amber">
          <span className="dot amberdot" />
          {user.amberBalance} $AMBER
        </div>
      </div>

      <div className="buttons">
        <button type="button" onClick={() => onOpen('bag')} aria-label="Bag">
          Bag
        </button>
        <button type="button" onClick={() => onOpen('market')} aria-label="Market">
          Market
        </button>
        <button type="button" onClick={() => onOpen('deliveries')} aria-label="Deliveries">
          Orders
        </button>
        <button type="button" onClick={() => onOpen('settings')} aria-label="Settings">
          ⚙
        </button>
      </div>

      {quest && (
        <div className="quest">
          <div className="quest-text">{quest.text}</div>
          <div className="quest-bar">
            <div
              className="quest-fill"
              style={{
                width: `${Math.min(100, (quest.current / Math.max(1, quest.target)) * 100)}%`,
              }}
            />
          </div>
          <div className="quest-count">
            {Math.min(quest.current, quest.target)}/{quest.target}
          </div>
        </div>
      )}

      <style jsx>{`
        .hud {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 12;
          font-size: 0.85rem;
        }
        .stats {
          position: absolute;
          top: max(0.75rem, env(safe-area-inset-top));
          left: max(0.75rem, env(safe-area-inset-left));
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          border-radius: 999px;
          background: rgba(10, 46, 61, 0.78);
          border: 1px solid rgba(245, 230, 200, 0.18);
          font-weight: 700;
          color: #f5e6c8;
        }
        .dot {
          width: 0.6rem;
          height: 0.6rem;
          border-radius: 50%;
          display: inline-block;
        }
        .coin {
          background: #f4d35e;
        }
        .amberdot {
          background: #f4b942;
        }
        .buttons {
          position: absolute;
          /* Below the minimap, which the Phaser HUD scene draws top-right. */
          top: calc(max(0.75rem, env(safe-area-inset-top)) + 148px);
          right: max(0.75rem, env(safe-area-inset-right));
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          pointer-events: auto;
        }
        .buttons button {
          padding: 0.55rem 0.9rem;
          border: 1px solid rgba(245, 230, 200, 0.2);
          border-radius: 12px;
          background: rgba(10, 46, 61, 0.82);
          color: #f5e6c8;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .quest {
          position: absolute;
          top: calc(max(0.75rem, env(safe-area-inset-top)) + 3.4rem);
          left: max(0.75rem, env(safe-area-inset-left));
          width: min(16rem, 55vw);
          padding: 0.6rem 0.8rem;
          border-radius: 12px;
          background: rgba(10, 46, 61, 0.78);
          border: 1px solid rgba(245, 230, 200, 0.16);
        }
        .quest-text {
          font-size: 0.8rem;
          color: #f5e6c8;
          margin-bottom: 0.4rem;
        }
        .quest-bar {
          height: 5px;
          border-radius: 3px;
          background: rgba(245, 230, 200, 0.18);
          overflow: hidden;
        }
        .quest-fill {
          height: 100%;
          background: #f4b942;
          transition: width 360ms ease;
        }
        .quest-count {
          margin-top: 0.25rem;
          font-size: 0.7rem;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
