'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchInvite } from '@/lib/api';
import ContractRow from './ContractRow';
import InviteGate from './InviteGate';
import WorldBackdrop from './WorldBackdrop';

/**
 * The front door.
 *
 * The backdrop is the world itself, not a drawing of it: the same terrain and
 * day cycle the game runs, rendering behind the door. It needs no account to
 * do that, so a visitor who has never played still arrives at a real place.
 * The drawn scene stays underneath as the fallback.
 *
 * The code box lives here too — the same component /play uses, in an inline
 * variant, so there is still only one gate. If the gate read fails the page
 * still works: it shows Play, and /play does its own check.
 *
 * The X link defaults to the real account in code rather than depending on
 * deploy configuration. `NEXT_PUBLIC_*` is baked at build time, so a variable
 * set after a build is a variable that silently does nothing; a link that only
 * works when someone remembers an env file is a link that is usually broken.
 *
 * One screen, and nothing below it. The marketing sections that used to follow
 * — what it is, how it plays, about the token — were cut on request. The page
 * has one job now: show the vale, take a code, and let someone in.
 */
const X_URL = process.env.NEXT_PUBLIC_X_URL?.trim() || 'https://x.com/Ambervalefun';
const TG_URL = process.env.NEXT_PUBLIC_TG_URL?.trim() || 'https://t.me/ambervalefun';

export default function Landing() {
  const [required, setRequired] = useState<boolean | null>(null);
  const [passed, setPassed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    void fetchInvite()
      .then((s) => {
        if (!live) return;
        setRequired(s.required);
        setPassed(s.ok);
      })
      .catch(() => live && setRequired(false));
    return () => {
      live = false;
    };
  }, []);

  const locked = required === true && !passed;

  // Straight into the game once the code lands. Anyone who just typed an
  // invite code has said plainly what they came for.
  const onPass = useCallback(() => {
    setPassed(true);
    router.push('/play');
  }, [router]);

  return (
    <main>
      {/* Transparent over the world. Its own controls carry backgrounds, so
          the bar needs none of its own — and a strip of chrome across the top
          is the fastest way to make a live scene look like a screenshot. */}
      <header className="bar">
        <div className="wrap barwrap">
          <span className="brand">
            <img src="/brand/mark.svg" alt="" width={34} height={34} />
            <img className="bw" src="/brand/wordmark.svg" alt="AMBERVALE" />
          </span>
          <nav>
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="xlink">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
                <path
                  fill="currentColor"
                  d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-7.3L5.9 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6.6L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z"
                />
              </svg>
              <span>Follow on X</span>
            </a>
            <a href={TG_URL} target="_blank" rel="noopener noreferrer" className="xlink">
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
                <path
                  fill="currentColor"
                  d="M21.9 4.3 18.6 19.8c-.25 1.1-.9 1.37-1.83.85l-5.06-3.73-2.44 2.35c-.27.27-.5.5-1.02.5l.36-5.15L18 6.16c.41-.36-.09-.57-.63-.2L5.79 13.25l-4.98-1.56c-1.08-.34-1.1-1.08.23-1.6L20.5 2.55c.9-.33 1.69.2 1.4 1.74Z"
                />
              </svg>
              <span>Telegram</span>
            </a>
            <Link href="/play" className="barcta">
              {locked ? 'Enter code' : 'Play'}
            </Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <WorldBackdrop fallback="/brand/vale.svg" />
        <div className="veil" aria-hidden />

        <div className="lockup" data-locked={locked}>
          <span className="eyebrow">Closed beta · runs in your browser</span>
          <img className="mark" src="/brand/mark.svg" alt="" width={132} height={132} />
          <img className="word" src="/brand/wordmark.svg" alt="AMBERVALE" />
          <p className="tag">A little farm, a long evening.</p>

          {locked ? (
            <div className="gatebox">
              <InviteGate variant="inline" onPass={onPass} />
            </div>
          ) : (
            <>
              <Link href="/play" className="cta">
                Play
              </Link>
              <p className="note">No download, no install.</p>
            </>
          )}

          <div className="ca">
            <ContractRow />
          </div>
        </div>
      </section>

      <style jsx>{`
        main {
          background: #061c26;
          color: #f5e6c8;
        }

        /* -- top bar ---------------------------------------------------- */
        .bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 40;
          padding: 0.7rem 1.5rem;
          transition:
            background 0.25s ease,
            border-color 0.25s ease;
          border-bottom: 1px solid transparent;
        }
        .barwrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 0.55rem;
        }
        .brand :global(.bw) {
          height: 15px;
          width: auto;
        }
        nav {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .barwrap :global(.xlink) {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.42rem 0.8rem;
          border-radius: 999px;
          border: 1px solid rgba(245, 230, 200, 0.22);
          color: #f5e6c8;
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 600;
        }
        .barwrap :global(.barcta) {
          padding: 0.44rem 1rem;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          text-decoration: none;
          font-size: 0.82rem;
          font-weight: 700;
        }

        /* -- hero ------------------------------------------------------- */
        .hero {
          position: relative;
          min-height: 100svh;
          height: 100svh;
          display: grid;
          place-items: center;
          padding: 5rem 1.5rem 5rem;
          overflow: hidden;
        }
        /* Two washes. The radial darkens behind the lockup so cream text
           holds; the linear lands the hero on the next section's colour, so
           the seam is not a hard line across the page. Tuned against the live
           world rather than a dusk illustration — the game runs a day cycle,
           and a scrim judged against an evening drawing leaves cream type on
           lit midday meadow with nothing under it. */
        .veil {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(to bottom, rgba(6, 28, 38, 0) 66%, #061c26 100%),
            radial-gradient(
              78% 62% at 50% 34%,
              rgba(6, 28, 38, 0.74) 0%,
              rgba(6, 28, 38, 0.46) 62%,
              rgba(6, 28, 38, 0.62) 100%
            );
        }
        .lockup {
          position: relative;
          z-index: 2;
          width: min(30rem, 100%);
          text-align: center;
        }
        .lockup :global(img) {
          display: block;
          margin: 0 auto;
        }
        /*
          The locked state has a whole card in it, and the hero is exactly one
          screen with overflow hidden — so anything that does not fit is not
          merely below the fold, it is gone. The contract row was being clipped
          off the bottom entirely. Everything above the code box gives up a
          little room when the gate is up.
        */
        .lockup[data-locked='true'] :global(.mark) {
          width: clamp(3.25rem, 8vw, 4.5rem);
        }
        .lockup[data-locked='true'] :global(.word) {
          width: min(15rem, 70%);
          margin-top: 0.5rem;
        }
        .lockup[data-locked='true'] .eyebrow {
          margin-bottom: 0.75rem;
        }
        .lockup[data-locked='true'] .tag {
          margin: 0.5rem 0 0;
          font-size: 0.95rem;
        }
        .lockup[data-locked='true'] .gatebox {
          margin-top: 1rem;
        }
        .lockup[data-locked='true'] .ca {
          margin-top: 1rem;
        }

        .lockup :global(.mark) {
          width: clamp(4.5rem, 12vw, 7rem);
          height: auto;
          filter: drop-shadow(0 12px 30px rgba(4, 18, 26, 0.6));
        }
        .lockup :global(.word) {
          width: min(21rem, 88%);
          height: auto;
          margin-top: 0.8rem;
          filter: drop-shadow(0 4px 18px rgba(4, 18, 26, 0.8));
        }
        .eyebrow {
          display: block;
          margin-bottom: 1.4rem;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #f4b942;
          opacity: 0.9;
          text-shadow: 0 2px 12px rgba(4, 18, 26, 0.8);
        }
        .tag {
          margin: 0.9rem 0 1.9rem;
          font-size: 1rem;
          color: #f5e6c8;
          opacity: 0.86;
          letter-spacing: 0.03em;
          text-shadow: 0 2px 12px rgba(4, 18, 26, 0.75);
        }
        .lockup :global(.cta) {
          display: block;
          width: 100%;
          padding: 1rem;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-decoration: none;
          box-shadow: 0 10px 30px rgba(4, 18, 26, 0.5);
        }
        .note {
          margin: 0.9rem 0 0;
          font-size: 0.8rem;
          opacity: 0.72;
          text-shadow: 0 2px 12px rgba(4, 18, 26, 0.75);
        }
        .ca {
          margin-top: 1.4rem;
          text-align: center;
        }

        /* -- bands ------------------------------------------------------ */
        .band + .band,
        .wrap {
          width: min(64rem, 100%);
          margin: 0 auto;
        }

        /* -- footer ----------------------------------------------------- */
        footer {
          padding: 1.7rem 1.5rem 2.6rem;
          font-size: 0.8rem;
          opacity: 0.62;
        }

        @media (max-width: 520px) {
          .barwrap :global(.xlink) span {
            display: none;
          }
          .barwrap :global(.xlink) {
            padding: 0.42rem 0.55rem;
          }
        }
      `}</style>
    </main>
  );
}
