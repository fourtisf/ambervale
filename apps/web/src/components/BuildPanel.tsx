'use client';

import { useCallback, useState } from 'react';
import { BUILDS, BUILD_KEYS, type BuildKey } from '@ambervale/game-config';
import { bridge } from '@/game/bridge';
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

  return (
    <div className="builds">
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
