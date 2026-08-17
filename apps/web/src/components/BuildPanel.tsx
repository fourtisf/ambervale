'use client';

import { useCallback, useState } from 'react';
import {
  BUILDS,
  BUILD_KEYS,
  homesteadNext,
  homesteadTier,
  type BuildKey,
} from '@ambervale/game-config';
import { bridge } from '@/game/bridge';
import ShopBanner from './ShopBanner';
import { apiPost } from '@/lib/api';
import { audio } from '@/lib/audio';
import { commit, reportError, useFarm, type ActionReply } from './farmState';

/**
 * Where coins finally buy something you can look at.
 *
 * Every upgrade tier and both meadows came to about an hour of farming, and
 * after that coins bought a title and nothing else. These cost far more and do
 * nothing at all — no yield, no multiplier — which is the point. A farm should
 * show what has been done to it, and until now hour twenty and hour two were
 * pixel-identical.
 */
export default function BuildPanel() {
  const farm = useFarm();
  const [busy, setBusy] = useState<string | null>(null);

  const build = useCallback(async (key: BuildKey) => {
    setBusy(key);
    try {
      const r = await apiPost<ActionReply & { renown?: number }>('/act/build', { key });
      commit(r);
      audio.amber();
      bridge.toast('good', `${BUILDS[key].name} stands in the vale.`);
      // Close the sheet: the whole reward is out there, not in here.
      bridge.emit('modal', null);
      bridge.emit('walkTo', {
        x: BUILDS[key].at.x * 64 + 32,
        y: BUILDS[key].at.y * 64 + 32,
      });
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(null);
    }
  }, []);

  if (!farm) return null;

  const built = new Set(farm.builds?.map((b) => b.key) ?? []);
  const have = (item: 'wood' | 'stone') => farm.inventory[item] ?? 0;

  const tier = homesteadTier(farm.homesteadTier ?? 1);
  const next = homesteadNext(tier.tier);
  const nextShort: string[] = [];
  if (next && farm.user.level >= next.unlockLv) {
    if (farm.user.coins < next.cost.coins) nextShort.push('coins');
    if (next.cost.amber && farm.user.amberBalance < next.cost.amber) nextShort.push('$AMBER');
    if (next.cost.wood && have('wood') < next.cost.wood) nextShort.push('wood');
    if (next.cost.stone && have('stone') < next.cost.stone) nextShort.push('stone');
  }

  const raise = async () => {
    if (!next) return;
    setBusy('homestead');
    try {
      const r = await apiPost<ActionReply>('/act/homestead', {});
      commit(r);
      audio.amber();
      bridge.toast('good', `The ${next.name} stands where the cottage was.`);
      bridge.emit('modal', null);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="builds">
      <ShopBanner scene="build" />

      {/*
        The Homestead: the one big upgrade, above the landmark list because it
        is the largest thing on the sheet and the only one that changes the
        building the player already lives in.
      */}
      <div className="homestead" data-max={!next}>
        <div className="hometext">
          <em className="eyebrow">The Homestead</em>
          <b>
            {tier.name}
            {next ? ` → ${next.name}` : ' — complete'}
          </b>
          <small>{next ? next.blurb : tier.blurb}</small>
          {next && <small className="perk">{next.perk}</small>}
          {next && (
            <em className="cost">
              {next.cost.coins} coins
              {next.cost.amber ? ` · ${next.cost.amber} $AMBER` : ''}
              {next.cost.wood ? ` · ${next.cost.wood} wood` : ''}
              {next.cost.stone ? ` · ${next.cost.stone} stone` : ''}
              {` · +${next.renown} renown`}
            </em>
          )}
          {nextShort.length > 0 && <em className="short">Short on {nextShort.join(', ')}.</em>}
        </div>
        {next ? (
          <button
            type="button"
            disabled={farm.user.level < next.unlockLv || nextShort.length > 0 || busy !== null}
            onClick={() => void raise()}
          >
            {farm.user.level < next.unlockLv
              ? `Level ${next.unlockLv}`
              : busy === 'homestead'
                ? 'Raising…'
                : 'Raise it'}
          </button>
        ) : (
          <span className="tick">✓</span>
        )}
      </div>

      <p className="intro">
        Nothing here earns you anything. It stands in the vale, it is visible from the road, and it
        is still there tomorrow.
      </p>

      <ul className="rows">
        {BUILD_KEYS.map((key) => {
          const def = BUILDS[key];
          const done = built.has(key);
          const locked = farm.user.level < def.unlockLv;

          const short: string[] = [];
          if (!done && !locked) {
            if (farm.user.coins < def.cost.coins) short.push('coins');
            if (def.cost.amber && farm.user.amberBalance < def.cost.amber) short.push('$AMBER');
            if (def.cost.wood && have('wood') < def.cost.wood) short.push('wood');
            if (def.cost.stone && have('stone') < def.cost.stone) short.push('stone');
          }

          return (
            <li key={key} data-done={done} data-locked={locked}>
              <div className="name">
                <b>{def.name}</b>
                <small>{done ? 'Standing' : def.blurb}</small>
                {/* Price shows on locked rows too. The point of this sheet is
                    to give coins somewhere to go, and a row that says only
                    "Level 7" gives a level-2 player nothing to save toward. */}
                {!done && (
                  <em className="cost">
                    {def.cost.coins} coins
                    {def.cost.amber ? ` · ${def.cost.amber} $AMBER` : ''}
                    {def.cost.wood ? ` · ${def.cost.wood} wood` : ''}
                    {def.cost.stone ? ` · ${def.cost.stone} stone` : ''}
                    {` · +${def.renown} renown`}
                  </em>
                )}
                {short.length > 0 && <em className="short">Short on {short.join(', ')}.</em>}
              </div>

              {done ? (
                <span className="tick">✓</span>
              ) : (
                <button
                  type="button"
                  disabled={locked || short.length > 0 || busy !== null}
                  onClick={() => void build(key)}
                >
                  {locked ? `Level ${def.unlockLv}` : busy === key ? 'Building…' : 'Build'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <style jsx>{`
        .homestead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin: 0 0 0.9rem;
          padding: 0.75rem 0.85rem;
          border-radius: 14px;
          background: rgba(244, 185, 66, 0.1);
          border: 1px solid rgba(244, 185, 66, 0.35);
        }
        .homestead[data-max='true'] {
          background: rgba(122, 200, 130, 0.12);
          border-color: rgba(122, 200, 130, 0.4);
        }
        .hometext {
          flex: 1;
          min-width: 0;
        }
        .eyebrow {
          display: block;
          font-style: normal;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #f4b942;
          margin-bottom: 0.15rem;
        }
        .hometext b {
          font-size: 0.92rem;
        }
        .hometext small {
          display: block;
          margin-top: 0.15rem;
          font-size: 0.72rem;
          opacity: 0.75;
          line-height: 1.4;
        }
        .hometext .perk {
          color: #9fe8ff;
          opacity: 0.9;
        }
        .homestead button {
          flex: 0 0 auto;
          padding: 0.55rem 0.95rem;
          border-radius: 999px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          font-size: 0.78rem;
          cursor: pointer;
          white-space: nowrap;
        }
        .homestead button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .intro {
          margin: 0 0 0.9rem;
          font-size: 0.8rem;
          line-height: 1.5;
          opacity: 0.7;
        }
        .rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .rows li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.65rem 0.75rem;
          border-radius: 12px;
          background: rgba(245, 230, 200, 0.07);
        }
        .rows li[data-done='true'] {
          background: rgba(122, 200, 130, 0.16);
        }
        .rows li[data-locked='true'] {
          opacity: 0.5;
        }
        .name {
          flex: 1;
          min-width: 0;
        }
        .name b {
          font-size: 0.88rem;
        }
        .name small {
          display: block;
          margin-top: 0.1rem;
          font-size: 0.72rem;
          opacity: 0.7;
          line-height: 1.4;
        }
        .cost {
          display: block;
          margin-top: 0.25rem;
          font-style: normal;
          font-size: 0.7rem;
          color: #f4d35e;
          font-variant-numeric: tabular-nums;
        }
        .short {
          display: block;
          margin-top: 0.15rem;
          font-style: normal;
          font-size: 0.68rem;
          color: #f2a09a;
        }
        .rows li button {
          flex: 0 0 auto;
          padding: 0.5rem 0.9rem;
          border-radius: 999px;
          border: 0;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          font-size: 0.78rem;
          cursor: pointer;
          white-space: nowrap;
        }
        .rows li button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .tick {
          color: #7ac882;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}
