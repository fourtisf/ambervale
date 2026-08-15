'use client';

import { useCallback, useEffect, useState } from 'react';
import { bridge } from '@/game/bridge';
import { TUTORIAL, TUTORIAL_DONE } from '@/game/tutorial';
import { apiPatch, type FarmState } from '@/lib/api';
import { audio } from '@/lib/audio';

/**
 * The tutorial banner.
 *
 * Step position is server state, not local state: the banner reads
 * `farm.user.tutorialStep` and asks the server to advance it. Refreshing
 * mid-tutorial therefore resumes on the same step, on any device.
 */
export default function TutorialBanner() {
  const [farm, setFarm] = useState<FarmState | null>(bridge.farm);
  const [busy, setBusy] = useState(false);
  /**
   * Skip asks first.
   *
   * It is a small word next to a thumb on a phone, and until Settings grew a
   * Replay row a stray tap ended the tutorial for good with no way back.
   */
  const [confirmSkip, setConfirmSkip] = useState(false);

  useEffect(() => bridge.on('farm', setFarm), []);

  // The banner renders null between steps rather than unmounting, so without
  // this the confirm would still be open when the tutorial came back — which
  // it does now, from Settings.
  const stepNow = farm?.user.tutorialStep ?? null;
  useEffect(() => setConfirmSkip(false), [stepNow]);

  const advance = useCallback(async (step: number) => {
    setBusy(true);
    try {
      await apiPatch('/tutorial/step', { step });
      // Re-read authoritative state rather than patching a local copy.
      const current = bridge.farm;
      if (current) {
        bridge.emit('farm', {
          ...current,
          user: { ...current.user, tutorialStep: step },
        });
      }
      if (step === TUTORIAL_DONE) {
        bridge.toast('info', 'Tutorial skipped — you can replay it any time from Settings.');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  if (!farm || !bridge.started) return null;

  const step = farm.user.tutorialStep;
  if (step === TUTORIAL_DONE || step >= TUTORIAL.length) return null;

  const current = TUTORIAL[step]!;

  return (
    <div className="tut">
      <div className="head">
        <span className="count">
          Step {step + 1} of {TUTORIAL.length}
        </span>
        {confirmSkip ? (
          <span className="confirm">
            <button type="button" className="skip" onClick={() => setConfirmSkip(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="skip yes"
              disabled={busy}
              onClick={() => void advance(TUTORIAL_DONE)}
            >
              Skip for good
            </button>
          </span>
        ) : (
          <button type="button" className="skip" onClick={() => setConfirmSkip(true)}>
            Skip
          </button>
        )}
      </div>

      <p className="text">{current.text(farm)}</p>

      <div className="actions">
        <button
          type="button"
          className="guide"
          onClick={() => {
            audio.resume();
            bridge.emit('walkTo', current.approach(farm));
          }}
        >
          Guide me
        </button>
        {current.textOnly && (
          <button
            type="button"
            className="next"
            disabled={busy}
            onClick={() => void advance(step + 1)}
          >
            Next
          </button>
        )}
      </div>

      <style jsx>{`
        .tut {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          /* Sits just above the controls rather than mid-screen: the field is
             what the step is asking you to look at. */
          bottom: max(7.5rem, calc(env(safe-area-inset-bottom) + 7.5rem));
          width: min(24rem, 90vw);
          padding: 0.65rem 0.85rem;
          border-radius: 14px;
          background: rgba(9, 38, 50, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(244, 185, 66, 0.35);
          color: #f5e6c8;
          z-index: 25;
          pointer-events: auto;
          box-shadow: 0 8px 26px rgba(4, 18, 26, 0.5);
        }
        .head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.4rem;
        }
        .count {
          font-size: 0.68rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.6;
        }
        .skip {
          background: none;
          border: 0;
          color: #f5e6c8;
          opacity: 0.6;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 0.2rem 0.3rem;
        }
        .confirm {
          display: flex;
          gap: 0.2rem;
        }
        .yes {
          color: #f2a09a;
          opacity: 0.9;
        }
        .text {
          margin: 0 0 0.55rem;
          font-size: 0.86rem;
          line-height: 1.35;
        }
        .actions {
          display: flex;
          gap: 0.5rem;
        }
        .actions button {
          flex: 1;
          padding: 0.5rem;
          border-radius: 10px;
          border: 0;
          font-weight: 700;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .guide {
          background: rgba(245, 230, 200, 0.14);
          color: #f5e6c8;
        }
        .next {
          background: #f4b942;
          color: #2a1a05;
        }
      `}</style>
    </div>
  );
}
