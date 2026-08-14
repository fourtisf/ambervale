'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { JOYSTICK } from '@ambervale/game-config';
import { bridge, type Interaction } from '@/game/bridge';
import { audio } from '@/lib/audio';

/**
 * Fixed virtual joystick and the contextual action button.
 *
 * Pointer Events with setPointerCapture throughout — never touch events. Touch
 * events lose the stream the moment a finger slides outside the element, and
 * they fight the browser's own gesture handling; pointer capture keeps every
 * move routed to the stick until the finger lifts, wherever it wanders.
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

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerId.current !== null) return;
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
    [setVector],
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
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      release();
    },
    [release],
  );

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
