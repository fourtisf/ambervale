'use client';

import { useCallback, useEffect, useState } from 'react';
import { bridge } from '@/game/bridge';
import { ApiRequestError, apiGet, apiPost, type WalletPreview, type WalletSignIn } from '@/lib/api';
import { activeChain } from '@/lib/wallet/chains';
import { walletProvider } from '@/lib/wallet/provider';

interface WalletState {
  linked: boolean;
  address?: string;
  chainId?: number;
}

interface ClaimQuota {
  amberBalance: number;
  claimable: number;
  enabled: boolean;
  walletLinked: boolean;
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * The wallet is the account.
 *
 * A farm used to belong to a browser — a localStorage id and a cookie — so
 * clearing either lost it for good. Signing a nonce with a wallet turns the
 * address into a durable identity: connect the same wallet anywhere and the
 * farm comes back.
 *
 * The one dangerous case is deliberate and surfaced before anything is signed:
 * connecting a wallet that already owns a farm switches to *that* farm and
 * leaves the current one behind. The preview call exists purely so the player
 * sees both sides of that trade before the wallet ever prompts them.
 */
export default function WalletPanel() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [quota, setQuota] = useState<ClaimQuota | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ preview: WalletPreview; address: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [w, q] = await Promise.all([
        apiGet<WalletState>('/wallet'),
        apiGet<ClaimQuota>('/claim/quota'),
      ]);
      setWallet(w);
      setQuota(q);
    } catch {
      // The panel is optional; a failed read just leaves it blank.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Step one: find out what signing would do, without prompting to sign. */
  const begin = async () => {
    setBusy(true);
    try {
      if (!walletProvider.isAvailable()) {
        bridge.toast('warn', 'No browser wallet found. Install one, then try again.');
        return;
      }

      const account = await walletProvider.connect();
      const preview = await apiPost<WalletPreview>('/wallet/preview', {
        address: account.address,
      });

      if (preview.outcome === 'recovered') {
        // Signing here would abandon the farm being played. Stop and ask.
        setPending({ preview, address: account.address });
        return;
      }

      await sign(account.address, account.chainId);
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };

  /** Step two: sign the nonce and let the server decide the outcome. */
  const sign = async (address: string, walletChainId: number | null) => {
    const { nonce, domain, userId } = await apiPost<{
      nonce: string;
      domain: string;
      userId: string;
    }>('/wallet/nonce', {});

    const chainId = walletChainId ?? activeChain.id;
    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      address,
      '',
      'Link this wallet to your AMBERVALE farm.',
      '',
      `URI: ${domain}`,
      'Version: 1',
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Account: ${userId}`,
    ].join('\n');

    const signature = await walletProvider.signMessage(address, message);
    const result = await apiPost<WalletSignIn>('/wallet/link', { address, signature, chainId });

    // The reply carries the authoritative farm for whichever account now owns
    // this session, so the whole game re-renders from it rather than from a
    // stale copy of the farm we were on a moment ago.
    result.farm.__receivedAt = Date.now();
    bridge.emit('farm', result.farm);

    bridge.toast(
      'good',
      result.outcome === 'recovered'
        ? 'Welcome back — your farm has been restored.'
        : result.outcome === 'already'
          ? 'This wallet already holds this farm.'
          : 'Wallet connected. Your farm is saved to it now.',
    );

    await refresh();
  };

  const confirmRecovery = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const account = await walletProvider.getAccount();
      await sign(pending.address, account?.chainId ?? null);
      setPending(null);
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };

  const report = (err: unknown) => {
    bridge.toast(
      'warn',
      err instanceof ApiRequestError ? err.message : 'Could not connect that wallet.',
    );
  };

  const claimsOpen = quota?.enabled ?? false;

  return (
    <div className="wallet">
      <div className="row">
        <span>Wallet</span>
        {wallet?.linked ? (
          <code>{short(wallet.address!)}</code>
        ) : (
          <button type="button" disabled={busy} onClick={() => void begin()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>

      {!wallet?.linked && !pending && (
        <p className="hint">
          Connect a wallet and this farm is saved to it. Sign in with the same wallet on any browser
          or device and it comes back.
        </p>
      )}

      {pending?.preview.target && (
        <div className="warn">
          <b>That wallet already has a farm.</b>
          <p>
            Signing switches you to it — level {pending.preview.target.level},{' '}
            {pending.preview.target.coins} coins. The farm you are playing now (level{' '}
            {pending.preview.current?.level ?? 1}, {pending.preview.current?.coins ?? 0} coins) is
            left behind and will not be saved to this wallet.
          </p>
          <div className="choices">
            <button type="button" disabled={busy} onClick={() => void confirmRecovery()}>
              {busy ? 'Restoring…' : 'Restore that farm'}
            </button>
            <button type="button" className="ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="row">
        <span>$AMBER</span>
        <b>{quota?.amberBalance ?? 0}</b>
      </div>

      <div className="row">
        <span>Claim</span>
        <button type="button" disabled title={claimsOpen ? undefined : 'Claims are not open yet.'}>
          {claimsOpen ? `Claim ${quota?.claimable ?? 0}` : 'Not open yet'}
        </button>
      </div>

      <style jsx>{`
        .wallet {
          padding: 0.2rem 0;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.7rem 0;
          border-bottom: 1px solid rgba(245, 230, 200, 0.1);
        }
        .row button {
          padding: 0.45rem 1rem;
          border-radius: 9px;
          border: 1px solid rgba(245, 230, 200, 0.25);
          background: transparent;
          color: #f5e6c8;
          cursor: pointer;
          font-weight: 600;
        }
        .row button:disabled {
          opacity: 0.45;
          cursor: default;
        }
        code {
          font-size: 0.78rem;
          opacity: 0.85;
        }
        .hint {
          margin: 0.5rem 0 0;
          font-size: 0.72rem;
          opacity: 0.6;
          line-height: 1.5;
        }
        .warn {
          margin: 0.7rem 0;
          padding: 0.75rem 0.85rem;
          border-radius: 12px;
          background: rgba(242, 160, 154, 0.12);
          border: 1px solid rgba(242, 160, 154, 0.4);
        }
        .warn b {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.85rem;
        }
        .warn p {
          margin: 0 0 0.7rem;
          font-size: 0.76rem;
          line-height: 1.5;
          opacity: 0.85;
        }
        .choices {
          display: flex;
          gap: 0.4rem;
        }
        .choices button {
          flex: 1;
          padding: 0.5rem;
          border-radius: 9px;
          border: 0;
          background: #f2a09a;
          color: #2a1a05;
          font-weight: 700;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .choices .ghost {
          background: rgba(245, 230, 200, 0.14);
          color: #f5e6c8;
        }
      `}</style>
    </div>
  );
}
