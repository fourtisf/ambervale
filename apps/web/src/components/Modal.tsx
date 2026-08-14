'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Bottom-sheet modal shell.
 *
 * Escape closes, the backdrop closes, and body scroll is already locked by the
 * `.playing` class. Content scrolls inside the sheet so a long inventory never
 * makes the page itself scroll under the game canvas.
 */
export default function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onPointerDown={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>

      <style jsx>{`
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(4, 18, 26, 0.62);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 40;
          backdrop-filter: blur(2px);
        }
        .sheet {
          width: min(30rem, 100%);
          max-height: 82dvh;
          display: flex;
          flex-direction: column;
          background: #0f3a4c;
          border: 1px solid rgba(245, 230, 200, 0.18);
          border-bottom: 0;
          border-radius: 18px 18px 0 0;
          color: #f5e6c8;
          animation: slide 200ms ease-out;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.1rem 0.6rem;
          border-bottom: 1px solid rgba(245, 230, 200, 0.12);
        }
        header h2 {
          margin: 0;
          font-size: 1.05rem;
          letter-spacing: 0.04em;
        }
        header button {
          background: none;
          border: 0;
          color: #f5e6c8;
          font-size: 1.1rem;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
        }
        .body {
          padding: 0.9rem 1.1rem;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        footer {
          padding: 0.8rem 1.1rem max(1.1rem, env(safe-area-inset-bottom));
          border-top: 1px solid rgba(245, 230, 200, 0.12);
        }
        @keyframes slide {
          from {
            transform: translateY(14px);
            opacity: 0;
          }
          to {
            transform: none;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
