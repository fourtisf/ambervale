'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, apiPost } from '@/lib/api';

/**
 * The closed-beta door.
 *
 * This screen is a courtesy, not the lock. The API refuses every game
 * endpoint without a pass cookie, so skipping straight to /play or calling
 * the API by hand gets a 403 either way — which is the only arrangement worth
 * shipping, because the bundle this screen lives in is public.
 */
export default function InviteGate({ onPass }: { onPass: () => void }) {
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
        await apiPost('/auth/invite', { code: code.trim() });
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

  return (
    <div className="gate">
      <div className="card">
        <img src="/brand/mark.svg" alt="" width={92} height={92} />
        <img className="word" src="/brand/wordmark.svg" alt="AMBERVALE" />

        <p className="lead">The vale is closed for now. Enter your invite code.</p>

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
        .gate {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          background: radial-gradient(120% 100% at 50% 6%, #14495e 0%, #0a2e3d 55%, #061c26 100%);
          color: #f5e6c8;
          z-index: 50;
        }
        .card {
          width: min(22rem, 100%);
          text-align: center;
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
