/**
 * Chain configuration.
 *
 * ALFA's decision was left blank in the brief, whose stated default is
 * "Robinhood Chain EVM unless told otherwise" — so that is what this targets.
 * Robinhood Chain is an Arbitrum Orbit rollup, which means a stock EVM chain
 * definition is all viem/wagmi need; nothing here is Orbit-specific.
 *
 * Ids and RPC URLs come from env so they can be corrected without a code
 * change once the real values are published. See docs/DECISIONS.md.
 */

import { defineChain } from 'viem';

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const robinhoodTestnet = defineChain({
  id: num(process.env.NEXT_PUBLIC_CHAIN_ID_TESTNET, 421614),
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_TESTNET ?? 'https://sepolia-rollup.arbitrum.io/rpc'],
    },
  },
  testnet: true,
});

export const robinhoodMainnet = defineChain({
  id: num(process.env.NEXT_PUBLIC_CHAIN_ID_MAINNET, 42161),
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_MAINNET ?? 'https://arb1.arbitrum.io/rpc'] },
  },
});

/** Testnet unless explicitly told otherwise — nothing here moves real value. */
export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN_ENV === 'mainnet' ? robinhoodMainnet : robinhoodTestnet;
