'use client';

import type { FarmState } from '@/lib/api';

/**
 * Title screen: the live world drifts along the CINE waypoints behind a
 * bottom sheet. Pressing Start hands the camera to the player.
 */
export default function TitleScreen({
  farm,
  loading,
  error,
  onStart,
  onRetry,
}: {
  farm: FarmState | null;
  loading: boolean;
  error: string | null;
  onStart: () => void;
  onRetry: () => void;
}) {
  const returning = (farm?.user.counters.plantedCount ?? 0) > 0 || (farm?.user.level ?? 1) > 1;

  return (
    <div className="title-root">
      <div className="title-logo">
        <h1>AMBERVALE</h1>
        <p>A little farm, a long evening.</p>
      </div>

      <div className="title-sheet">
        {error ? (
          <>
            <p className="title-error">{error}</p>
            <button type="button" className="title-button" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="title-stats">
              {farm ? (
                <>
                  <span>
                    <b>{farm.user.coins}</b> coins
                  </span>
                  <span>
                    Level <b>{farm.user.level}</b>
                  </span>
                  <span>
                    <b>{farm.user.amberBalance}</b> $AMBER
                  </span>
                </>
              ) : (
                <span>Waking the farm…</span>
              )}
            </div>
            <button
              type="button"
              className="title-button"
              disabled={loading || !farm}
              onClick={onStart}
            >
              {loading ? 'Loading…' : returning ? 'Continue' : 'Start'}
            </button>
            <p className="title-hint">
              Move with the stick or WASD · interact with the action button or E
            </p>
          </>
        )}
      </div>

      <style jsx>{`
        .title-root {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          pointer-events: none;
          z-index: 20;
        }
        .title-logo {
          margin-top: max(6vh, 2rem);
          text-align: center;
          text-shadow: 0 3px 18px rgba(4, 18, 26, 0.75);
        }
        .title-logo h1 {
          margin: 0;
          font-size: clamp(2.6rem, 11vw, 5rem);
          letter-spacing: 0.14em;
          color: #f5e6c8;
        }
        .title-logo p {
          margin: 0.35rem 0 0;
          color: #f4b942;
          letter-spacing: 0.06em;
          font-size: 0.95rem;
        }
        .title-sheet {
          pointer-events: auto;
          width: min(28rem, 100%);
          margin: 0 auto;
          padding: 1.5rem 1.5rem max(1.5rem, env(safe-area-inset-bottom));
          background: rgba(10, 46, 61, 0.92);
          border-top: 2px solid rgba(245, 230, 200, 0.18);
          border-radius: 18px 18px 0 0;
          backdrop-filter: blur(6px);
          text-align: center;
        }
        .title-stats {
          display: flex;
          justify-content: center;
          gap: 1.25rem;
          font-size: 0.9rem;
          opacity: 0.85;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .title-button {
          width: 100%;
          padding: 0.95rem 1rem;
          border: 0;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
        }
        .title-button:disabled {
          opacity: 0.55;
          cursor: progress;
        }
        .title-hint {
          margin: 0.85rem 0 0;
          font-size: 0.75rem;
          opacity: 0.6;
        }
        .title-error {
          margin: 0 0 1rem;
          color: #ff9f9f;
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
