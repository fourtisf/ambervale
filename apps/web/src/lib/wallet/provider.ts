/**
 * Wallet abstraction.
 *
 * Everything the game does with a wallet goes through this interface, so
 * swapping the EVM implementation for a Solana adapter later is a matter of
 * writing a second class rather than touching any calling code. The interface
 * deliberately speaks in strings — address, message, signature — and never
 * exposes an EVM-shaped type.
 */

export interface WalletAccount {
  address: string;
  chainId: number | null;
}

export interface WalletProvider {
  readonly id: string;
  readonly label: string;
  /** False when the wallet is simply not present in this browser. */
  isAvailable(): boolean;
  connect(): Promise<WalletAccount>;
  disconnect(): Promise<void>;
  /** Signs a plain-text message. The server verifies it. */
  signMessage(address: string, message: string): Promise<string>;
  getAccount(): Promise<WalletAccount | null>;
}

/** Minimal EIP-1193 surface — avoids depending on a wallet-specific type. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function injected(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

/**
 * The browser-extension wallet (MetaMask, Rabby, Coinbase Wallet, …).
 *
 * WalletConnect is configured separately in wagmi for mobile; this path
 * covers desktop and in-app browsers without needing a project id.
 */
export class InjectedWalletProvider implements WalletProvider {
  readonly id = 'injected';
  readonly label = 'Browser wallet';

  isAvailable(): boolean {
    return injected() !== null;
  }

  async connect(): Promise<WalletAccount> {
    const eth = injected();
    if (!eth) throw new Error('No browser wallet found.');

    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    const address = accounts[0];
    if (!address) throw new Error('No account was shared.');

    const chainIdHex = (await eth.request({ method: 'eth_chainId' })) as string;
    return { address, chainId: Number.parseInt(chainIdHex, 16) };
  }

  async disconnect(): Promise<void> {
    // EIP-1193 has no disconnect; the user revokes access in the wallet. The
    // app forgets the link server-side instead.
  }

  async signMessage(address: string, message: string): Promise<string> {
    const eth = injected();
    if (!eth) throw new Error('No browser wallet found.');
    return (await eth.request({
      method: 'personal_sign',
      params: [message, address],
    })) as string;
  }

  async getAccount(): Promise<WalletAccount | null> {
    const eth = injected();
    if (!eth) return null;
    const accounts = (await eth.request({ method: 'eth_accounts' })) as string[];
    const address = accounts[0];
    if (!address) return null;
    const chainIdHex = (await eth.request({ method: 'eth_chainId' })) as string;
    return { address, chainId: Number.parseInt(chainIdHex, 16) };
  }
}

export const walletProvider: WalletProvider = new InjectedWalletProvider();
