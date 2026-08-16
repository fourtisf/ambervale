'use client';

import { useCallback, useEffect, useState } from 'react';
import { bridge, type Interaction } from '@/game/bridge';
import { EXPECTED_KIND, escortFor } from '@/game/escort';
import { counterForGoal } from '@/game/guidance';
import { audio } from '@/lib/audio';
import type { FarmState } from '@/lib/api';

/**
 * The task you are actually doing, kept on screen until it is done.
 *
 * Before this, picking a goal closed the sheet, walked you somewhere, and
 * fired one toast — which had already faded by the time you arrived, and was
 * written before the game knew what you would find when you got there. The
 * cow goal was the clearest failure: "stand by the cow and press the action
 * button", with the milk still a second away and the action button blank.
 *
 * So this stays. It re-asks escortFor once a second, so the line changes from
 * "wait, 8s" to "press the action button" by itself; it shows progress, so
 * two-of-three is visible without opening anything; and it closes itself when
 * the goal completes, which is the only moment a player is actually finished.
 */
export default function TaskEscort() {
  const [farm, setFarm] = useState<FarmState | null>(bridge.farm);
  const [goalId, setGoalId] = useState<string | null>(null);
  /** What is in reach this instant — the game's own answer, not a guess. */
  const [reach, setReach] = useState<Interaction | null>(bridge.interaction);
  /** Ticks the countdowns; farm snapshots alone are far too infrequent. */
  const [, force] = useState(0);

  useEffect(() => bridge.on('farm', setFarm), []);
  useEffect(() => bridge.on('escort', (id) => setGoalId(id)), []);
  useEffect(() => bridge.on('interaction', setReach), []);

  useEffect(() => {
    if (!goalId) return;
    const timer = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [goalId]);

  const goal = goalId
    ? (farm?.daily.goals.find((g) => g.id === goalId) ??
      (farm?.quest?.id === goalId
        ? {
            id: farm.quest.id,
            text: farm.quest.text,
            current: farm.quest.current,
            target: farm.quest.target,
            done: false,
          }
        : null))
    : null;

  // Completion is the one moment worth interrupting for, and the one moment
  // the old flow never marked at all.
  const done = goal?.done === true;
  useEffect(() => {
    if (!done || !goal) return;
    audio.coin();
    bridge.toast('good', `Done — ${goal.text}`);
    const id = window.setTimeout(() => bridge.emit('escort', null), 1200);
    return () => window.clearTimeout(id);
  }, [done, goal]);

  const stop = useCallback(() => bridge.emit('escort', null), []);

  const walk = useCallback(() => {
    if (!farm || !goalId) return;
    const counter = counterForGoal(goalId);
    const at = counter ? escortFor(counter, farm).at : null;
    if (at) bridge.emit('walkTo', at);
  }, [farm, goalId]);

  if (!farm || !goalId || !goal) return null;

  const counter = counterForGoal(goalId);
  const escort = counter ? escortFor(counter, farm) : null;
  if (!escort) return null;

  /*
    "Ready" and "you can press it" are different questions, and conflating them
    is what produced the original bug: the milk was ready, the player was
    standing where the guidance had put them, and the action button was blank
    because that spot was 71px from the cow against a reach of 74. Pathing
    jitter alone decided it. Rather than tune pixels, ask the game what is
    actually in reach and say so.
  */
  const wants = EXPECTED_KIND[counter as keyof typeof EXPECTED_KIND];
  const inPlace = !wants || reach?.kind === wants;
  const step = done
    ? 'Done.'
    : escort.ready && !inPlace
      ? 'Almost — you are not close enough yet. Take me there.'
      : escort.text;

  const pct = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0;

  return (
    <div className="escort" data-ready={escort.ready && inPlace} data-done={done}>
      <div className="head">
        <b>{goal.text}</b>
        <button type="button" className="close" onClick={stop} aria-label="Stop guiding">
          ✕
        </button>
      </div>

      <div className="bar">
        <span style={{ width: `${pct}%` }} />
      </div>

      <p className="step">
        {step}
        <span className="count">
          {goal.current}/{goal.target}
        </span>
      </p>

      {!done && escort.at && (
        <button type="button" className="go" onClick={walk}>
          Take me there
        </button>
      )}

      <style jsx>{`
        .escort {
          position: fixed;
          left: 50%;
          /* Above the controls, not beside them. The joystick is 110px wide at
             bottom 2rem and the action button 104px at bottom 2.5rem, which on
             a 400px phone leaves a 138px gap in the middle — too narrow for a
             sentence. Clearing them vertically is the only placement that
             works at both ends. */
          bottom: calc(env(safe-area-inset-bottom, 0px) + 9.5rem);
          transform: translateX(-50%);
          z-index: 60;
          width: min(30rem, calc(100vw - 2rem));
          padding: 0.7rem 0.85rem;
          border-radius: 14px;
          background: rgba(10, 46, 61, 0.93);
          border: 1px solid rgba(245, 230, 200, 0.16);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          color: #f5e6c8;
          backdrop-filter: blur(6px);
        }
        /* Ready is the moment to look up at the world, so it is the only state
           that gets any colour. Waiting must not shout. */
        .escort[data-ready='true'] {
          border-color: rgba(122, 200, 130, 0.5);
        }
        .escort[data-done='true'] {
          border-color: rgba(122, 200, 130, 0.9);
          background: rgba(24, 66, 44, 0.95);
        }
        .head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.6rem;
        }
        .head b {
          font-size: 0.88rem;
          line-height: 1.3;
        }
        .close {
          flex: 0 0 auto;
          border: 0;
          background: transparent;
          color: #f5e6c8;
          opacity: 0.55;
          font-size: 0.9rem;
          cursor: pointer;
          padding: 0 0.15rem;
          line-height: 1;
        }
        .bar {
          margin: 0.45rem 0 0.4rem;
          height: 4px;
          border-radius: 999px;
          background: rgba(245, 230, 200, 0.15);
          overflow: hidden;
        }
        .bar span {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: #7ac882;
          transition: width 0.3s ease;
        }
        .step {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.6rem;
          margin: 0;
          font-size: 0.78rem;
          line-height: 1.45;
          opacity: 0.9;
        }
        .count {
          flex: 0 0 auto;
          font-variant-numeric: tabular-nums;
          font-weight: 700;
          opacity: 0.75;
        }
        .go {
          margin-top: 0.55rem;
          width: 100%;
          padding: 0.45rem 0.8rem;
          border-radius: 999px;
          border: 0;
          background: rgba(245, 230, 200, 0.14);
          color: #f5e6c8;
          font-size: 0.74rem;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
