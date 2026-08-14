'use client';

import { useCallback, useEffect, useState } from 'react';
import { bridge } from '@/game/bridge';
import { ApiRequestError, apiGet, apiPost } from '@/lib/api';
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
 * Wallet linking and the claim button.
 *
 * The claim button is deliberately rendered but disabled while the server
 * reports claims closed — the player should be able to see that the feature
 * exists and that their balance is counted, without it doing anything.
 */
export default function WalletPanel() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [quota, setQuota] = useState<ClaimQuota | null>(null);
  const [busy, setBusy] = useState(false);

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

  const link = async () => {
    setBusy(true);
    try {
      if (!walletProvider.isAvailable()) {
        bridge.toast('warn', 'No browser wallet found. Install one, then try again.');
        return;
      }

      const account = await walletProvider.connect();

      // The nonce is issued and consumed server-side, so a signature captured
      // from one attempt cannot be replayed on another.
      const { nonce, domain, userId } = await apiPost<{
        nonce: string;
        domain: string;
        userId: string;
      }>('/wallet/nonce', {});

      const chainId = account.chainId ?? activeChain.id;
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        account.address,
        '',
        'Link this wallet to your AMBERVALE farm.',
        '',
        `URI: ${domain}`,
        'Version: 1',
        `Chain ID: ${chainId}`,
        `Nonce: ${nonce}`,
        `Account: ${userId}`,
      ].join('\n');

      const signature = await walletProvider.signMessage(account.address, message);
      await apiPost('/wallet/link', { address: account.address, signature, chainId });

      bridge.toast('good', 'Wallet linked.');
      await refresh();
    } catch (err) {
      bridge.toast(
        'warn',
        err instanceof ApiRequestError ? err.message : 'Could not link that wallet.',
      );
    } finally {
      setBusy(false);
    }
  };

  const claimsOpen = quota?.enabled ?? false;

  return (
    <div className="wallet">
      <div className="row">
        <span>Wallet</span>
        {wallet?.linked ? (
          <code>{short(wallet.address!)}</code>
        ) : (
          <button type="button" disabled={busy} onClick={() => void link()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>

      <div className="row">
        <span>$AMBER</span>
        <b>{quota?.amberBalance ?? 0}</b>
      </div>

      <div className="row">
        <span>Claim</span>
        <button type="button" disabled title={claimsOpen ? undefined : 'Claims open soon'}>
          {claimsOpen ? `Claim ${quota?.claimable ?? 0}` : 'Claims open soon'}
        </button>
      </div>

      <p className="note">
        Linking proves you control the address; it never moves anything. Claims are closed while the
        contract is being finished — your $AMBER keeps accruing in the meantime.
      </p>

      <style jsx>{`
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
          cursor: not-allowed;
        }
        code {
          font-family: ui-monospace, Menlo, monospace;
          font-size: 0.8rem;
          color: #9fe8ff;
        }
        b {
          color: #f4b942;
        }
        .note {
          margin-top: 0.9rem;
          font-size: 0.72rem;
          opacity: 0.6;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
