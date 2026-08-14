'use client';

import { useEffect, useState } from 'react';
import { bridge, type ToastMessage } from '@/game/bridge';

const LIFETIME_MS = 3400;

/** Transient messages: four variants, newest at the bottom, auto-expiring. */
export default function Toasts() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(() => {
    let nextId = 1;
    return bridge.on('toast', (toast) => {
      const item: ToastMessage = { ...toast, id: nextId++ };
      setItems((current) => [...current, item].slice(-4));
      window.setTimeout(() => {
        setItems((current) => current.filter((t) => t.id !== item.id));
      }, LIFETIME_MS);
    });
  }, []);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
      <style jsx>{`
        .toasts {
          position: fixed;
          left: 50%;
          transform: translateX(-50%);
          top: max(4.5rem, calc(env(safe-area-inset-top) + 4.5rem));
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          z-index: 30;
          pointer-events: none;
          width: min(24rem, 90vw);
        }
        .toast {
          padding: 0.6rem 0.9rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 600;
          color: #08222d;
          background: #f5e6c8;
          box-shadow: 0 6px 20px rgba(4, 18, 26, 0.4);
          animation: rise 220ms ease-out;
        }
        .toast.good {
          background: #9fe0a4;
        }
        .toast.warn {
          background: #f4d35e;
        }
        .toast.bad {
          background: #f2a09a;
        }
        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
