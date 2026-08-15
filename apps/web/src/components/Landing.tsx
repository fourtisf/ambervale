'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchInvite } from '@/lib/api';

/**
 * The front door.
 *
 * The gate state is read once on mount so the button can say what it will
 * actually do. It does not put the code box here, though: /play shows the
 * gate over the running world, which is a better thing to look at while
 * typing than a flat page, and one gate is easier to keep right than two.
 * If the read fails the button still works — /play does its own check, and a
 * landing page that refuses to render because a status call timed out is
 * worse than one that is slightly optimistic.
 */
export default function Landing() {
  const [required, setRequired] = useState<boolean | null>(null);
  const [passed, setPassed] = useState(false);

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

  return (
    <main className="landing">
      <div className="stack">
        <img className="mark" src="/brand/mark.svg" alt="" width={132} height={132} />
        <img className="word" src="/brand/wordmark.svg" alt="AMBERVALE" />

        <p className="tag">A little farm, a long evening.</p>

        <Link href="/play" className="cta">
          {locked ? 'Enter your invite code' : 'Play'}
        </Link>

        {locked && <p className="note">The vale is invite-only while it is being built.</p>}
      </div>

      <div className="ground" aria-hidden />

      <style jsx>{`
        .landing {
          position: relative;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 2rem 1.5rem 6rem;
          overflow: hidden;
          background: radial-gradient(120% 100% at 50% 6%, #14495e 0%, #0a2e3d 55%, #061c26 100%);
          color: #f5e6c8;
        }
        .stack {
          position: relative;
          z-index: 2;
          width: min(26rem, 100%);
          text-align: center;
        }
        .stack :global(img) {
          display: block;
          margin: 0 auto;
        }
        .stack :global(.mark) {
          width: clamp(5.5rem, 22vw, 8.25rem);
          height: auto;
          filter: drop-shadow(0 10px 26px rgba(4, 18, 26, 0.55));
        }
        .stack :global(.word) {
          width: min(20rem, 88%);
          height: auto;
          margin-top: 0.7rem;
        }
        .tag {
          margin: 0.9rem 0 2rem;
          font-size: 0.95rem;
          color: #f4b942;
          letter-spacing: 0.04em;
        }
        .stack :global(.cta) {
          display: block;
          width: 100%;
          padding: 0.95rem 1rem;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-decoration: none;
          box-shadow: 0 8px 24px rgba(4, 18, 26, 0.45);
        }
        .note {
          margin: 1.1rem 0 0;
          font-size: 0.76rem;
          opacity: 0.55;
        }
        /* A sliver of the world under the fold, so the page belongs to the
           game rather than to a generic dark template. */
        .ground {
          position: absolute;
          left: -6%;
          right: -6%;
          bottom: -90px;
          height: 220px;
          background: #5a9a4a;
          border-radius: 50% 50% 0 0 / 90px 90px 0 0;
          z-index: 1;
        }
        .ground::before {
          content: '';
          position: absolute;
          inset: 0 0 auto;
          height: 14px;
          background: #68a851;
          border-radius: 50% 50% 0 0 / 14px 14px 0 0;
        }
      `}</style>
    </main>
  );
}
