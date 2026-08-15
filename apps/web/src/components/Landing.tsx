'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchInvite } from '@/lib/api';

/**
 * The front door.
 *
 * It used to be a logo and a button on an empty field, which told a visitor
 * nothing: not what the game is, not what you do in it, and not what $AMBER
 * means — the one question anyone arriving from a token-shaped link actually
 * has. On a wide screen it was also mostly a flat green band, because a
 * decorative sliver sized for a phone becomes a quarter of a desktop viewport.
 *
 * The gate state is read once on mount so the button can say what it will
 * actually do. It does not put the code box here: /play shows the gate over
 * the running world, which is a better thing to look at while typing, and one
 * gate is easier to keep right than two. If the read fails the button still
 * works — /play does its own check, and a landing page that refuses to render
 * because a status call timed out is worse than one that is optimistic.
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
  const x = process.env.NEXT_PUBLIC_X_URL;

  return (
    <main>
      <section className="hero">
        <div className="scene" aria-hidden />
        <div className="veil" aria-hidden />

        <div className="lockup">
          <img className="mark" src="/brand/mark.svg" alt="" width={132} height={132} />
          <img className="word" src="/brand/wordmark.svg" alt="AMBERVALE" />
          <p className="tag">A little farm, a long evening.</p>

          <Link href="/play" className="cta">
            {locked ? 'Enter your invite code' : 'Play'}
          </Link>

          <p className="note">
            {locked
              ? 'The vale is invite-only while it is being built.'
              : 'Runs in the browser. No download, no install.'}
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2>Tend a farm that does not wait for you</h2>
          <p className="lede">
            Plant, water, harvest, and sell into a market that remembers what you sold it. Chop,
            mine, fish, mill, and fill orders for the people who live here. It is a small place and
            it runs in real time, so it is best in short visits — an evening at a time.
          </p>

          <figure className="shot">
            {/* A real frame from the running game, not a mockup: a field mid-growth,
                one plot with a crow on it, and the action button offering to
                chase it off. */}
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
          <ul className="cards">
            <li>
              <h3>Prices move</h3>
              <p>
                Flood the market with one crop and it pays you less for it, then recovers on its
                own. A mixed field beats a monoculture, and patience beats dumping.
              </p>
            </li>
            <li>
              <h3>Crows come</h3>
              <p>
                A crop left standing after it is ready attracts one. Harvest from under it and it
                pays less; leave it long enough and the crop is gone. A scarecrow buys you time.
              </p>
            </li>
            <li>
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
          <h2 className="small">About $AMBER</h2>
          <p className="plain">
            $AMBER is an in-game balance. You earn it from deliveries and quests, and you can spend
            it on upgrades and renown. <b>Spending is permanent.</b>
          </p>
          <p className="plain">
            There is no way to move it out of the game, no contract, and{' '}
            <b>no date is promised for one</b>. Anyone telling you otherwise is not us. If that ever
            changes it will be announced here first.
          </p>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <span>AMBERVALE · a farm-to-earn browser game, in closed beta</span>
          <span className="links">
            {x && (
              <a href={x} target="_blank" rel="noopener noreferrer">
                X
              </a>
            )}
            <Link href="/play">Play</Link>
          </span>
        </div>
      </footer>

      <style jsx>{`
        main {
          background: #061c26;
          color: #f5e6c8;
        }

        /* -- hero ------------------------------------------------------- */
        .hero {
          position: relative;
          min-height: 100svh;
          display: grid;
          place-items: center;
          padding: 3rem 1.5rem 4rem;
          overflow: hidden;
        }
        /* The vale as a background image rather than an inline SVG element:
           it is decoration, so it should not sit in the DOM a screen reader
           walks, and a cover background keeps the horizon pinned to the
           bottom on any shape of window. The old page's flat green band was a
           fixed-height sliver, which is why a wide screen turned it into a
           quarter of the page. */
        .scene {
          position: absolute;
          inset: 0;
          background: #0a2e3d url('/brand/vale.svg') center bottom / cover no-repeat;
        }
        /* Two washes, doing different jobs. The radial one darkens behind the
           lockup so cream text holds against sky, meadow and the low sun
           alike; the linear one lands the hero on the next section's colour
           so the seam between them is not a hard line across the page. The
           first draft used one heavy radial for both and turned the vale into
           a murky smear — which defeats showing it at all. */
        .veil {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(to bottom, rgba(6, 28, 38, 0) 62%, #061c26 100%),
            radial-gradient(
              70% 55% at 50% 36%,
              rgba(6, 28, 38, 0.58) 0%,
              rgba(6, 28, 38, 0.18) 70%,
              rgba(6, 28, 38, 0.34) 100%
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
          width: clamp(5rem, 14vw, 8rem);
          height: auto;
          filter: drop-shadow(0 12px 30px rgba(4, 18, 26, 0.6));
        }
        .lockup :global(.word) {
          width: min(22rem, 90%);
          height: auto;
          margin-top: 0.85rem;
        }
        /* The scene behind these two is whatever the viewport happens to
           crop to — sky on a wide window, meadow on a tall phone. A shadow
           costs nothing and means neither line depends on which. */
        .tag,
        .note {
          text-shadow: 0 2px 12px rgba(4, 18, 26, 0.75);
        }
        .tag {
          margin: 1rem 0 2.2rem;
          font-size: 1rem;
          color: #f4b942;
          letter-spacing: 0.05em;
        }
        .lockup :global(.cta) {
          display: block;
          width: 100%;
          padding: 1rem 1rem;
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
          margin: 1.1rem 0 0;
          font-size: 0.8rem;
          opacity: 0.78;
        }

        /* -- bands ------------------------------------------------------ */
        .band {
          padding: clamp(3rem, 8vw, 5.5rem) 1.5rem;
        }
        .band + .band,
        footer {
          border-top: 1px solid rgba(245, 230, 200, 0.08);
        }
        .band.alt {
          background: #08242f;
        }
        .wrap {
          width: min(64rem, 100%);
          margin: 0 auto;
        }
        .wrap.narrow {
          width: min(42rem, 100%);
        }
        h2 {
          margin: 0 0 0.9rem;
          font-size: clamp(1.5rem, 3.4vw, 2.1rem);
          line-height: 1.2;
          letter-spacing: 0.01em;
        }
        h2.small {
          font-size: clamp(1.2rem, 2.6vw, 1.5rem);
        }
        .lede {
          margin: 0 0 2.4rem;
          max-width: 44rem;
          font-size: 1.02rem;
          line-height: 1.65;
          opacity: 0.82;
        }
        .plain {
          margin: 0 0 1rem;
          font-size: 0.98rem;
          line-height: 1.65;
          opacity: 0.82;
        }
        .plain b {
          color: #f4b942;
          font-weight: 700;
        }

        .shot {
          margin: 0;
        }
        .shot :global(img) {
          display: block;
          width: 100%;
          height: auto;
          border-radius: 14px;
          border: 1px solid rgba(245, 230, 200, 0.14);
          box-shadow: 0 20px 60px rgba(2, 12, 18, 0.55);
        }
        figcaption {
          margin-top: 0.7rem;
          font-size: 0.78rem;
          opacity: 0.5;
        }

        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
          gap: 1.1rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .cards li {
          padding: 1.35rem 1.3rem;
          border-radius: 14px;
          background: rgba(245, 230, 200, 0.045);
          border: 1px solid rgba(245, 230, 200, 0.1);
        }
        h3 {
          margin: 0 0 0.55rem;
          font-size: 1.05rem;
          color: #f4b942;
        }
        .cards p {
          margin: 0;
          font-size: 0.92rem;
          line-height: 1.6;
          opacity: 0.8;
        }

        /* -- footer ----------------------------------------------------- */
        footer {
          padding: 1.6rem 1.5rem 2.4rem;
          border-top: 1px solid rgba(245, 230, 200, 0.08);
          font-size: 0.8rem;
          opacity: 0.6;
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
      `}</style>
    </main>
  );
}
