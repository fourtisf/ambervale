'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The $AMBER contract address — or the honest absence of one.
 *
 * There is no contract yet. Rather than leave a hole in the page that someone
 * fills in with a rumour, this states it, and the same row becomes the real
 * address with a working copy button the moment `NEXT_PUBLIC_AMBER_CA` is set.
 * No code change, and no window in which the site is displaying an address
 * that is not real — which is the failure worth engineering against here,
 * since a wrong address on a game's own site is money lost by someone who
 * trusted it.
 */
/**
 * Does this look like a contract address anyone could actually use?
 *
 * Added after a placeholder from a copy-paste instruction — literally
 * `0xALAMAT_ASLI_ANDA` — went live and the site spent an evening advertising
 * an address that did not exist. A configuration value that reaches the public
 * page unchecked is a configuration value that will eventually be wrong, and
 * this is the one field where wrong means somebody sends money nowhere.
 *
 * Deliberately shape-only: EVM hex, or Solana-style base58. It cannot tell a
 * real deployment from a typo'd one, but it catches every placeholder anyone
 * would plausibly leave behind, and an unrecognised value falls back to
 * "Coming soon" rather than being displayed on trust.
 */
function looksLikeAddress(value: string): boolean {
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return true;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export default function ContractRow({ compact = false }: { compact?: boolean }) {
  const configured = process.env.NEXT_PUBLIC_AMBER_CA?.trim() ?? '';
  const address = looksLikeAddress(configured) ? configured : null;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard access can be refused outright — an insecure origin, or a
      // browser that wants a fresher gesture. Selecting the text is the
      // fallback that always works, so make it selectable rather than
      // reporting a failure nobody can act on.
      const el = document.getElementById('amber-ca');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [address]);

  return (
    <div className={compact ? 'row compact' : 'row'}>
      <span className="label">CA</span>

      {address ? (
        <>
          <code id="amber-ca" title={address}>
            {address}
          </code>
          <button type="button" onClick={() => void copy()} aria-label="Copy contract address">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </>
      ) : (
        <code className="soon">Coming soon</code>
      )}

      <style jsx>{`
        .row {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          max-width: 100%;
          padding: 0.6rem 0.75rem;
          border-radius: 12px;
          background: rgba(244, 185, 66, 0.08);
          border: 1px solid rgba(244, 185, 66, 0.24);
        }
        .row.compact {
          padding: 0.32rem 0.5rem;
          gap: 0.45rem;
          border-radius: 999px;
          font-size: 0.78rem;
        }
        .label {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #f4b942;
          white-space: nowrap;
        }
        code {
          flex: 1;
          min-width: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.82rem;
          /* The address is long and must never push the page sideways; on a
             phone it truncates rather than wraps, because a wrapped hex string
             is harder to read than a shortened one. */
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #f5e6c8;
          user-select: all;
        }
        .row.compact code {
          font-size: 0.74rem;
        }
        .soon {
          flex: 0 0 auto;
          opacity: 0.78;
        }
        button {
          padding: 0.34rem 0.7rem;
          border: 0;
          border-radius: 999px;
          background: #f4b942;
          color: #2a1a05;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          cursor: pointer;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
