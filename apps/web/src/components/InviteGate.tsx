'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, apiPost, setInvitePass, type InvitePass } from '@/lib/api';

/**
 * The closed-beta door.
 *
 * This screen is a courtesy, not the lock. The API refuses every game
 * endpoint without a pass cookie, so skipping straight to /play or calling
 * the API by hand gets a 403 either way — which is the only arrangement worth
 * shipping, because the bundle this screen lives in is public.
 */
export default function InviteGate({
  onPass,
  variant = 'overlay',
}: {
  onPass: () => void;
  /**
   * `overlay` covers the whole viewport, for /play, where the world is
   * already running behind it. `inline` drops the scrim and the fixed
   * positioning so the same card can sit inside the landing page's hero —
   * which has its own backdrop and its own layout to answer to.
   */
  variant?: 'overlay' | 'inline';
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy || code.trim().length === 0) return;

      setBusy(true);
      setError(null);
      try {
        const res = await apiPost<InvitePass>('/auth/invite', { code: code.trim() });
        // Held in memory for the life of this page and no longer, which is
        // what makes the code get asked for on the next visit.
        setInvitePass(res.pass ?? null);
        onPass();
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : 'Could not reach the gate. Try again.',
        );
        setCode('');
        inputRef.current?.focus();
      } finally {
        setBusy(false);
      }
    },
    [busy, code, onPass],
  );

  const inline = variant === 'inline';

  return (
    <div className={inline ? 'gate inline' : 'gate'}>
      <div className="card">
        {!inline && (
          <>
            <img src="/brand/mark.svg" alt="" width={92} height={92} />
            <img className="word" src="/brand/wordmark.svg" alt="AMBERVALE" />
          </>
        )}

        <p className="lead">
          {inline
            ? 'The vale is invite-only while it is being built. Enter your code to come in.'
            : 'The vale is closed for now. Enter your invite code.'}
        </p>

        <form onSubmit={submit}>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            // A numeric keypad on phones, without forcing type=number — that
            // brings spinners and rejects a code with a letter in it later.
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={16}
            placeholder="••••"
            aria-label="Invite code"
            aria-invalid={error !== null}
            disabled={busy}
          />
          <button type="submit" disabled={busy || code.trim().length === 0}>
            {busy ? 'Checking…' : 'Enter'}
          </button>
        </form>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <p className="note">
          Attempts are limited. Ask whoever sent you if the code stops working.
        </p>
      </div>

      <style jsx>{`
        /* A scrim, not a page. The vale is rendering underneath — dimmed
           enough that cream text on it stays readable over both a sunlit
           meadow and dark water, and blurred so the eye settles on the
           card rather than on the trees. */
        .gate {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          background: radial-gradient(
            85% 65% at 50% 45%,
            rgba(6, 28, 38, 0.28) 0%,
            rgba(6, 28, 38, 0.62) 100%
          );
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          color: #f5e6c8;
          z-index: 50;
        }
        /* Inline: no scrim, no fixed positioning, no blur. The hero it sits
           in already dims its own backdrop, and stacking a second wash on top
           of that one buries the world twice over. */
        .gate.inline {
          position: static;
          display: block;
          padding: 0;
          background: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          z-index: auto;
        }
        .gate.inline .card {
          width: 100%;
        }
        .card {
          width: min(22rem, 100%);
          padding: 1.75rem 1.5rem 1.5rem;
          border-radius: 22px;
          text-align: center;
          /* Its own panel, because a blur alone does not survive a bright
             patch of meadow passing behind the input. */
          background: rgba(6, 26, 35, 0.86);
          border: 1px solid rgba(245, 230, 200, 0.12);
          box-shadow: 0 18px 50px rgba(2, 12, 18, 0.6);
        }
        .card :global(img) {
          display: block;
          margin: 0 auto;
        }
        .card :global(.word) {
          width: min(15rem, 70%);
          height: auto;
          margin: 0.5rem auto 0;
        }
        .lead {
          margin: 1.4rem 0 1.1rem;
          font-size: 0.92rem;
          opacity: 0.8;
          line-height: 1.5;
        }
        form {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        input {
          width: 100%;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          border: 1.5px solid rgba(245, 230, 200, 0.25);
          background: rgba(4, 18, 26, 0.5);
          color: #f5e6c8;
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: 0.4em;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        input::placeholder {
          letter-spacing: 0.4em;
          opacity: 0.35;
        }
        input:focus {
          outline: none;
          border-color: #f4b942;
        }
        input[aria-invalid='true'] {
          border-color: #f2a09a;
        }
        button {
          width: 100%;
          padding: 0.9rem 1rem;
          border: 0;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.45;
          cursor: default;
        }
        .error {
          margin: 0.9rem 0 0;
          color: #f2a09a;
          font-size: 0.85rem;
        }
        .note {
          margin: 1.4rem 0 0;
          font-size: 0.72rem;
          opacity: 0.5;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
