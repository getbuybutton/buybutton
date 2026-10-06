import type { ChainId } from './chains'

// `value` of a CA is normalized: EVM lowercased, Solana kept as-is (base58 is case-sensitive).
export type Ref =
  | { kind: 'ca'; value: string }
  | { kind: 'ticker'; value: string }
  // A DEX pair from a link (Dexscreener/Axiom URLs carry the pair, not the token).
  | { kind: 'pair'; chain: ChainId; value: string }

export interface Quote {
  chain: ChainId
  address: string
  symbol: string
  name: string
  priceUsd: number
  marketCapUsd: number | null
  liquidityUsd: number | null
  change24h: number | null
  source: 'dexscreener' | 'pons-curve' | 'mock'
  // Share of the graduation threshold raised so far, for tokens still on the Pons curve.
  curveProgress?: number
}

// Rug check: one line per measured signal; ok = false is a red flag, null is informational.
export interface SafetyItem { label: string; value: string; ok: boolean | null }
export interface Safety { items: SafetyItem[]; flags: number }

export type Message = { type: 'quote'; ref: Ref } | { type: 'dexpaid'; chain: ChainId; address: string } | { type: 'safety'; chain: ChainId; address: string }
  | { type: 'trade'; venue: 'terminal' | 'applepay' | 'pumpfun'; chain: ChainId; address: string; amount?: number; anchor?: { left: number; top: number } }
export type QuoteResponse = { quote: Quote | null }
