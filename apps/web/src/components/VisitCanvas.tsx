'use client';

/**
 * Someone else's farm, walked in person.
 *
 * The same Phaser world as /play renders it — the visit payload is
 * FarmState-shaped on purpose — but the bridge is put into spectator mode
 * before the farm is emitted, so the interaction scan returns nothing and the
 * only verbs on this page are walking and signing the guestbook. The visitor
 * arrives already "started": no title screen on a doorstep.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { bridge } from '@/game/bridge';
import { ApiRequestError, authGuest, fetchVisit, signGuestbook, type VisitState } from '@/lib/api';
import { audio } from '@/lib/audio';
import Controls from './Controls';
import InviteGate from './InviteGate';
import Toasts from './Toasts';

export default function VisitCanvas({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [visit, setVisit] = useState<VisitState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** null while unknown, true while the invite gate must be shown. */
  const [gated, setGated] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  // Fetch first, boot second: a visit that 404s should never cost a WebGL
  // context, and the world hydrates instantly when it does boot. The same
  // invite gate stands in front of a visit as stands in front of /play —
  // links travel between players, and the door is the door.
  const load = useCallback(async () => {
    setError(null);
    try {
      let state: VisitState;
      try {
        state = await fetchVisit(slug);
      } catch (err) {
        // No session in this browser yet. Quietly become a guest and retry —
        // a visit link should open like a gate, not like a login form.
        if (!(err instanceof ApiRequestError) || err.status !== 401) throw err;
        await authGuest();
        state = await fetchVisit(slug);
      }
      setGated(false);
      state.__receivedAt = Date.now();
      setVisit(state);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setGated(true);
        return;
      }
      setError(
        err instanceof ApiRequestError && err.status === 401
          ? 'signin'
          : err instanceof ApiRequestError && err.status === 404
            ? 'Nobody farms at this address.'
            : 'Could not reach the vale.',
      );
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || !visit) return;

    let cancelled = false;
    document.body.classList.add('playing');

    void (async () => {
      const { createGame } = await import('@/game/createGame');
      if (cancelled) return;
      bridge.spectator = true;
      bridge.emit('farm', visit);
      gameRef.current = createGame(parent);
      if (process.env.NODE_ENV !== 'production') {
        (window as Window & { __ambervaleGame?: Phaser.Game }).__ambervaleGame = gameRef.current;
      }
      const off = bridge.on('worldReady', () => {
        bridge.emit('start', undefined);
        off();
      });
    })();

    return () => {
      cancelled = true;
      document.body.classList.remove('playing');
      gameRef.current?.destroy(true);
      gameRef.current = null;
      bridge.reset();
    };
    // The game boots once per visit payload; later signs update React only,
    // which is why the dependency is the null-ness and not the object.
  }, [visit === null]);

  const sign = useCallback(async () => {
    if (!note.trim()) return;
    setSigning(true);
    try {
      const fresh = await signGuestbook(slug, note);
      fresh.__receivedAt = Date.now();
      setVisit(fresh);
      setNote('');
      audio.amber();
      bridge.toast('good', 'Your note is in the book.');
    } catch (err) {
      audio.error();
      bridge.toast(
        'warn',
        err instanceof ApiRequestError ? err.message : 'The ink would not take.',
      );
    } finally {
      setSigning(false);
    }
  }, [slug, note]);

  if (gated) {
    return <InviteGate onPass={() => void load()} />;
  }

  if (error === 'signin') {
    return (
      <div className="gate">
        <b>AMBERVALE</b>
        <p>You need a farm of your own before you can call on the neighbours.</p>
        <a href="/play">Enter the vale</a>
        <style jsx>{`
          .gate {
            position: fixed;
            inset: 0;
            display: grid;
            place-content: center;
            gap: 0.8rem;
            text-align: center;
            background: #0a2e3d;
            color: #f5e6c8;
            padding: 2rem;
          }
          .gate b {
            letter-spacing: 0.3em;
          }
          .gate a {
            justify-self: center;
            padding: 0.6rem 1.4rem;
            border-radius: 999px;
            background: #f4b942;
            color: #2a1a05;
            font-weight: 700;
            text-decoration: none;
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gate">
        <b>AMBERVALE</b>
        <p>{error}</p>
        <a href="/play">Enter the vale</a>
        <style jsx>{`
          .gate {
            position: fixed;
            inset: 0;
            display: grid;
            place-content: center;
            gap: 0.8rem;
            text-align: center;
            background: #0a2e3d;
            color: #f5e6c8;
            padding: 2rem;
          }
          .gate b {
            letter-spacing: 0.3em;
          }
          .gate a {
            justify-self: center;
            padding: 0.6rem 1.4rem;
            border-radius: 999px;
            background: #f4b942;
            color: #2a1a05;
            font-weight: 700;
            text-decoration: none;
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        id="game-root"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100dvh',
          background: '#0a2e3d',
          overflow: 'hidden',
        }}
      />

      {visit && (
        <div className="plate">
          <b>{visit.user.handle}</b>
          <small>
            {visit.user.title ? `${visit.user.title} · ` : ''}Level {visit.user.level} ·{' '}
            {visit.user.renown} renown
          </small>
        </div>
      )}

      {visit && (
        <div className="book" data-open={bookOpen}>
          <button type="button" className="tab" onClick={() => setBookOpen((v) => !v)}>
            {bookOpen ? 'Close the book' : `Guestbook (${visit.guestbook.length})`}
          </button>
          {bookOpen && (
            <div className="pages">
              <div className="signrow">
                <input
                  value={note}
                  maxLength={140}
                  placeholder="Leave a note on the gate…"
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void sign();
                  }}
                />
                <button
                  type="button"
                  disabled={signing || !note.trim()}
                  onClick={() => void sign()}
                >
                  {signing ? '…' : 'Sign'}
                </button>
              </div>
              {visit.guestbook.length === 0 ? (
                <p className="empty">Nobody has signed yet. Be the first.</p>
              ) : (
                <ul>
                  {visit.guestbook.map((entry, i) => (
                    <li key={`${entry.at}-${i}`}>
                      <p>{entry.text}</p>
                      <small>
                        — {entry.author}, {new Date(entry.at).toLocaleDateString()}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <a className="own" href="/play">
        Get a farm of your own →
      </a>

      <Controls />
      <Toasts />

      <style jsx>{`
        .plate {
          position: fixed;
          top: 0.9rem;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
          background: rgba(10, 34, 46, 0.82);
          border: 1px solid rgba(245, 230, 200, 0.16);
          border-radius: 14px;
          padding: 0.5rem 1.2rem;
          color: #f5e6c8;
          z-index: 30;
        }
        .plate b {
          display: block;
          font-size: 0.95rem;
        }
        .plate small {
          font-size: 0.7rem;
          opacity: 0.75;
        }
        .book {
          position: fixed;
          right: 0.9rem;
          top: 0.9rem;
          z-index: 30;
          width: min(320px, calc(100vw - 1.8rem));
        }
        .tab {
          width: 100%;
          padding: 0.55rem 0.9rem;
          border-radius: 12px;
          border: 1px solid rgba(245, 230, 200, 0.16);
          background: rgba(10, 34, 46, 0.82);
          color: #f5e6c8;
          font-weight: 700;
          font-size: 0.78rem;
          cursor: pointer;
        }
        .pages {
          margin-top: 0.5rem;
          background: rgba(10, 34, 46, 0.92);
          border: 1px solid rgba(245, 230, 200, 0.16);
          border-radius: 14px;
          padding: 0.7rem;
          max-height: min(60vh, 26rem);
          overflow-y: auto;
        }
        .signrow {
          display: flex;
          gap: 0.4rem;
          margin-bottom: 0.6rem;
        }
        .signrow input {
          flex: 1;
          min-width: 0;
          padding: 0.5rem 0.7rem;
          border-radius: 10px;
          border: 1px solid rgba(245, 230, 200, 0.22);
          background: rgba(245, 230, 200, 0.08);
          color: #f5e6c8;
          font-size: 0.8rem;
        }
        .signrow button {
          padding: 0.5rem 0.9rem;
          border-radius: 10px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
        }
        .signrow button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .pages ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .pages li {
          background: rgba(245, 230, 200, 0.07);
          border-radius: 10px;
          padding: 0.5rem 0.65rem;
          color: #f5e6c8;
        }
        .pages li p {
          margin: 0 0 0.2rem;
          font-size: 0.8rem;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
        .pages li small {
          font-size: 0.68rem;
          opacity: 0.65;
        }
        .empty {
          margin: 0.2rem 0;
          color: #f5e6c8;
          opacity: 0.7;
          font-size: 0.78rem;
        }
        .own {
          position: fixed;
          bottom: 0.9rem;
          right: 0.9rem;
          z-index: 30;
          padding: 0.55rem 1rem;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          font-size: 0.78rem;
          text-decoration: none;
        }
      `}</style>
    </>
  );
}
