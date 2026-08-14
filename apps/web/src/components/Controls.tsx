'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { JOYSTICK } from '@ambervale/game-config';
import { bridge, type Interaction } from '@/game/bridge';
import { audio } from '@/lib/audio';

/** A frozen world is declared after this long without a rendered frame. */
const FREEZE_MS = 2000;

/**
 * Fixed virtual joystick and the contextual action button.
 *
 * Pointer Events with setPointerCapture throughout — never touch events. Touch
 * events lose the stream the moment a finger slides outside the element, and
 * they fight the browser's own gesture handling; pointer capture keeps every
 * move routed to the stick until the finger lifts, wherever it wanders.
 *
 * Capture is powerful enough to be dangerous: whatever grabs a pointer must
 * give it back on *every* path out, including the ones that never reach
 * pointerup — a cancelled gesture, a lost capture, a window that loses focus,
 * a tab switched away mid-drag. Miss one and `pointerId` stays occupied, every
 * later press is ignored, and the stick is dead for the rest of the session.
 * Hence the release-everywhere handlers below.
 */
export default function Controls() {
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const [interaction, setInteraction] = useState<Interaction | null>(bridge.interaction);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => bridge.on('interaction', setInteraction), []);

  // Tick the "growing" countdown on the action button once a second.
  useEffect(() => {
    if (!interaction?.remainingMs) {
      setCountdown(null);
      return;
    }
    const readyAt = Date.now() + interaction.remainingMs;
    const tick = () => setCountdown(Math.max(0, Math.ceil((readyAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [interaction]);

  const setVector = useCallback((dx: number, dy: number) => {
    const radius = JOYSTICK.radius;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, radius);
    const nx = dist === 0 ? 0 : (dx / dist) * clamped;
    const ny = dist === 0 ? 0 : (dy / dist) * clamped;

    bridge.input.moveX = nx / radius;
    bridge.input.moveY = ny / radius;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
    }
  }, []);

  const release = useCallback(() => {
    pointerId.current = null;
    bridge.input.moveX = 0;
    bridge.input.moveY = 0;
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
  }, []);

  /**
   * Hands a captured pointer back, tolerating a capture that is already gone.
   *
   * releasePointerCapture throws NotFoundError for a pointer the browser has
   * already retired — which is exactly what has happened by the time a
   * pointercancel handler runs. Letting that throw would skip the release
   * below it and strand the stick.
   */
  const dropCapture = useCallback((el: Element | null, id: number) => {
    try {
      (el as HTMLElement | null)?.releasePointerCapture?.(id);
    } catch {
      // Already released. Nothing to do, and nothing worth reporting.
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Take over from a pointer we never saw end. Refusing here is what made
      // a single missed release permanent; claiming the stick instead means
      // the next press always works.
      if (pointerId.current !== null && pointerId.current !== e.pointerId) {
        dropCapture(e.currentTarget, pointerId.current);
        release();
      }
      e.preventDefault();
      e.stopPropagation();

      pointerId.current = e.pointerId;
      // Capture routes every subsequent move here even if the thumb slides off
      // the pad or over the canvas.
      e.currentTarget.setPointerCapture(e.pointerId);

      const rect = e.currentTarget.getBoundingClientRect();
      origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setVector(e.clientX - origin.current.x, e.clientY - origin.current.y);
      audio.resume();
    },
    [setVector, dropCapture, release],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== e.pointerId) return;
      e.preventDefault();
      setVector(e.clientX - origin.current.x, e.clientY - origin.current.y);
    },
    [setVector],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== e.pointerId) return;
      dropCapture(e.currentTarget, e.pointerId);
      release();
    },
    [release, dropCapture],
  );

  // Every remaining way a drag can end without a pointerup on the pad: the
  // browser revoking the capture, the window losing focus, the tab going to
  // the background, or the press ending somewhere else entirely.
  useEffect(() => {
    const stop = () => {
      if (pointerId.current !== null) release();
    };
    const onGlobalUp = (e: PointerEvent) => {
      if (pointerId.current === e.pointerId) release();
    };

    window.addEventListener('pointerup', onGlobalUp);
    window.addEventListener('pointercancel', onGlobalUp);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      window.removeEventListener('pointerup', onGlobalUp);
      window.removeEventListener('pointercancel', onGlobalUp);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, [release]);

  /**
   * Watches for a world that has stopped rendering.
   *
   * If the stick is being pushed and no frame has been drawn for two seconds,
   * the character is not stuck — the game loop is. Saying so beats leaving
   * someone shoving a dead joystick, and reloading costs nothing because every
   * scrap of progress lives on the server.
   */
  useEffect(() => {
    let warned = false;
    const id = window.setInterval(() => {
      const pushing = bridge.input.moveX !== 0 || bridge.input.moveY !== 0;
      const frozen = bridge.lastFrameAt > 0 && Date.now() - bridge.lastFrameAt > FREEZE_MS;

      if (!pushing || !frozen) {
        if (!frozen) warned = false;
        return;
      }
      if (warned) return;
      warned = true;
      bridge.toast('bad', 'The world stopped drawing — reloading. Your farm is safe.');
      window.setTimeout(() => window.location.reload(), 1400);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Keyboard: E acts, same as the button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key.toLowerCase() !== 'e') return;
      if (bridge.openModal) return;
      audio.resume();
      bridge.emit('act', undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const act = useCallback(() => {
    audio.resume();
    bridge.emit('act', undefined);
  }, []);

  const label = countdown !== null && countdown > 0 ? `${countdown}s` : (interaction?.label ?? '—');

  return (
    <div className="controls">
      <div
        ref={padRef}
        className="pad"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={knobRef} className="knob" />
      </div>

      <button
        type="button"
        className="action"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          act();
        }}
        disabled={!interaction}
        data-disabled={interaction && !interaction.enabled ? 'true' : 'false'}
      >
        {label}
      </button>

      <style jsx>{`
        .controls {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 15;
        }
        .pad {
          position: absolute;
          left: max(1.5rem, env(safe-area-inset-left));
          bottom: max(2rem, env(safe-area-inset-bottom));
          width: ${JOYSTICK.radius * 2.4}px;
          height: ${JOYSTICK.radius * 2.4}px;
          border-radius: 50%;
          background: rgba(9, 38, 50, 0.34);
          border: 1.5px solid rgba(245, 230, 200, 0.2);
          pointer-events: auto;
          touch-action: none;
          display: grid;
          place-items: center;
        }
        .knob {
          width: ${JOYSTICK.radius}px;
          height: ${JOYSTICK.radius}px;
          border-radius: 50%;
          /* Softer than the old near-opaque cream disc, which drew the eye
             away from the farm every frame. */
          background: rgba(245, 230, 200, 0.62);
          border: 1.5px solid rgba(9, 38, 50, 0.35);
          will-change: transform;
        }
        .action {
          position: absolute;
          right: max(1.5rem, env(safe-area-inset-right));
          bottom: max(2.5rem, env(safe-area-inset-bottom));
          min-width: 6.5rem;
          padding: 1.1rem 1.4rem;
          border: 0;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-weight: 700;
          font-size: 0.95rem;
          pointer-events: auto;
          touch-action: none;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(4, 18, 26, 0.45);
        }
        .action:disabled {
          /* Idle state is a quiet slate chip, not a faded yellow smear that
             looks like a rendering fault. */
          background: rgba(9, 38, 50, 0.72);
          color: rgba(245, 230, 200, 0.55);
          box-shadow: none;
          opacity: 1;
          cursor: default;
        }
        .action[data-disabled='true'] {
          background: #7ea3b3;
          color: #0a2e3d;
        }
      `}</style>
    </div>
  );
}
