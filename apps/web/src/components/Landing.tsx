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
 */
const X_URL = process.env.NEXT_PUBLIC_X_URL?.trim() || 'https://x.com/Ambervalefun';

export default function Landing() {
  const [required, setRequired] = useState<boolean | null>(null);
  const [passed, setPassed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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
      {/* The bar is transparent over the hero and only takes a background once
          the page has moved, so the world is never framed by a strip of chrome
          at the moment someone first sees it. */}
      <header className={scrolled ? 'bar on' : 'bar'}>
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
            <Link href="/play" className="barcta">
              {locked ? 'Enter code' : 'Play'}
            </Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <WorldBackdrop fallback="/brand/vale.svg" />
        <div className="veil" aria-hidden />

        <div className="lockup">
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

        <a className="scroll" href="#what" aria-label="Read more">
          <span />
        </a>
      </section>

      <section className="band" id="what">
        <div className="wrap">
          <span className="eyebrow dark">What it is</span>
          <h2>Tend a farm that does not wait for you</h2>
          <p className="lede">
            Plant, water, harvest, and sell into a market that remembers what you sold it. Chop,
            mine, fish, mill, and fill orders for the people who live here. It is a small place and
            it runs in real time, so it is best in short visits — an evening at a time.
          </p>

          <figure className="shot">
            {/* A real frame from the running game, not a mockup: a field
                mid-growth, one plot with a crow on it, and the action button
                offering to chase it off. */}
            <img
              src="/shots/farm.jpg"
              alt="The farm at dusk, with crops growing and a crow on one plot"
            />
            <figcaption>The base field. One of those plots has a visitor.</figcaption>
          </figure>
        </div>
      </section>

      <section className="band alt">
        <div className="wrap">
          <span className="eyebrow dark">How it plays</span>
          <h2 className="small">Three things decide how a session goes</h2>
          <ul className="cards">
            <li>
              <span className="num">01</span>
              <h3>Prices move</h3>
              <p>
                Flood the market with one crop and it pays you less for it, then recovers on its
                own. A mixed field beats a monoculture, and patience beats dumping.
              </p>
            </li>
            <li>
              <span className="num">02</span>
              <h3>Crows come</h3>
              <p>
                A crop left standing after it is ready attracts one. Harvest from under it and it
                pays less; leave it long enough and the crop is gone. A scarecrow buys you time.
              </p>
            </li>
            <li>
              <span className="num">03</span>
              <h3>Orders and renown</h3>
              <p>
                Fill deliveries for $AMBER, claim the north and east meadows, and buy rank at the
                Vale Fund — an endless sink that grants no power at all.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="band">
        <div className="wrap narrow">
          <span className="eyebrow dark">The token</span>
          <h2 className="small">About $AMBER</h2>

          <div className="panel">
            <p className="plain">
              $AMBER is an in-game balance. You earn it from deliveries and quests, and you can
              spend it on upgrades and renown. <b>Spending is permanent.</b>
            </p>
            <p className="plain">
              There is <b>no contract yet</b> and no way to move it out of the game. No date is
              promised for one. Anyone posting an address before it appears here is not us.
            </p>
            <ContractRow />
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <span>AMBERVALE · a farm-to-earn browser game, in closed beta</span>
          <span className="links">
            <a href={X_URL} target="_blank" rel="noopener noreferrer">
              X
            </a>
            <Link href="/play">Play</Link>
          </span>
        </div>
      </footer>

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
        .bar.on {
          background: rgba(6, 28, 38, 0.86);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom-color: rgba(245, 230, 200, 0.1);
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
        .eyebrow.dark {
          margin-bottom: 0.7rem;
          text-shadow: none;
          opacity: 0.75;
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
          margin-top: 1.5rem;
          text-align: left;
        }
        .scroll {
          position: absolute;
          bottom: 1.6rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2;
          width: 24px;
          height: 38px;
          border-radius: 999px;
          border: 1.5px solid rgba(245, 230, 200, 0.35);
        }
        .scroll span {
          position: absolute;
          left: 50%;
          top: 8px;
          width: 3px;
          height: 7px;
          margin-left: -1.5px;
          border-radius: 2px;
          background: #f4b942;
          animation: dip 1.9s ease-in-out infinite;
        }
        @keyframes dip {
          0%,
          100% {
            transform: translateY(0);
            opacity: 1;
          }
          60% {
            transform: translateY(13px);
            opacity: 0.2;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .scroll span {
            animation: none;
          }
        }

        /* -- bands ------------------------------------------------------ */
        .band {
          padding: clamp(3.5rem, 9vw, 6.5rem) 1.5rem;
        }
        .band.alt {
          background: #08242f;
        }
        .band + .band,
        footer {
          border-top: 1px solid rgba(245, 230, 200, 0.08);
        }
        .wrap {
          width: min(64rem, 100%);
          margin: 0 auto;
        }
        .wrap.narrow {
          width: min(44rem, 100%);
        }
        h2 {
          margin: 0 0 1rem;
          font-size: clamp(1.6rem, 3.6vw, 2.3rem);
          line-height: 1.18;
          letter-spacing: -0.01em;
        }
        h2.small {
          font-size: clamp(1.3rem, 2.8vw, 1.7rem);
        }
        .lede {
          margin: 0 0 2.6rem;
          max-width: 44rem;
          font-size: 1.05rem;
          line-height: 1.7;
          opacity: 0.82;
        }
        .plain {
          margin: 0 0 1rem;
          font-size: 0.98rem;
          line-height: 1.7;
          opacity: 0.85;
        }
        .plain b {
          color: #f4b942;
          font-weight: 700;
        }
        .panel {
          padding: 1.6rem 1.5rem 1.4rem;
          border-radius: 16px;
          background: rgba(245, 230, 200, 0.04);
          border: 1px solid rgba(245, 230, 200, 0.1);
        }

        .shot {
          margin: 0;
        }
        .shot :global(img) {
          display: block;
          width: 100%;
          height: auto;
          border-radius: 16px;
          border: 1px solid rgba(245, 230, 200, 0.14);
          box-shadow: 0 24px 70px rgba(2, 12, 18, 0.6);
        }
        figcaption {
          margin-top: 0.75rem;
          font-size: 0.78rem;
          opacity: 0.5;
        }

        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
          gap: 1.1rem;
          margin: 1.8rem 0 0;
          padding: 0;
          list-style: none;
        }
        .cards li {
          position: relative;
          padding: 1.5rem 1.35rem 1.4rem;
          border-radius: 16px;
          background: rgba(245, 230, 200, 0.045);
          border: 1px solid rgba(245, 230, 200, 0.1);
        }
        .num {
          display: block;
          margin-bottom: 0.7rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.74rem;
          letter-spacing: 0.16em;
          color: #f4b942;
          opacity: 0.7;
        }
        h3 {
          margin: 0 0 0.55rem;
          font-size: 1.06rem;
        }
        .cards p {
          margin: 0;
          font-size: 0.93rem;
          line-height: 1.62;
          opacity: 0.8;
        }

        /* -- footer ----------------------------------------------------- */
        footer {
          padding: 1.7rem 1.5rem 2.6rem;
          font-size: 0.8rem;
          opacity: 0.62;
        }
        .foot {
          display: flex;
          flex-wrap: wrap;
          gap: 0.8rem 1.4rem;
          justify-content: space-between;
          align-items: center;
        }
        .links {
          display: flex;
          gap: 1.1rem;
        }
        .foot :global(a) {
          color: inherit;
          text-decoration: none;
          border-bottom: 1px solid rgba(245, 230, 200, 0.3);
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
