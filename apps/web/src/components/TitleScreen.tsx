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
        {/* Static art, so plain <img> rather than next/image: fixed intrinsic
            size, no layout shift to solve, and an SVG that scales itself. */}
        <img className="title-mark" src="/brand/mark.svg" alt="" width={112} height={112} />
        <img className="title-word" src="/brand/wordmark.svg" alt="AMBERVALE" />
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
          margin-top: max(5vh, 1.5rem);
          text-align: center;
        }
        .title-logo :global(.title-mark) {
          display: block;
          margin: 0 auto 0.6rem;
          width: clamp(4.5rem, 17vw, 7rem);
          height: auto;
          filter: drop-shadow(0 6px 20px rgba(4, 18, 26, 0.6));
        }
        .title-logo :global(.title-word) {
          display: block;
          margin: 0 auto;
          /* Carries its own outline and drop, so no text-shadow — one on top
             of the other reads as a smudge. This is the microtype-free cut;
             the strapline below already says it, in a size that survives
             being laid over bright grass. */
          width: min(24rem, 78vw);
          height: auto;
        }
        .title-logo p {
          margin: 0.5rem 0 0;
          text-shadow: 0 2px 12px rgba(4, 18, 26, 0.8);
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
