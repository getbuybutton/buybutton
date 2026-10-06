import { EVM_ADDRESS, SOLANA_ADDRESS, isChainId, normalizeAddress, type ChainId } from './chains'
import type { Ref } from './types'

// $TICKER: 2–10 chars, starts with a letter, not glued to a preceding word or a dollar amount.
// EVM CA: 0x + 40 hex, not part of a longer hex string (tx hashes are 64 hex).
// Solana CA: 32–44 base58 chars standing alone (not inside a URL path or a longer word).
export const TOKEN_RE =
  /(?<![\w$])\$([A-Za-z][A-Za-z0-9]{1,9})(?![\w])|(?<![\w])(0x[a-fA-F0-9]{40})(?![a-fA-F0-9])|(?<![\w/.#@-])([1-9A-HJ-NP-Za-km-z]{32,44})(?![\w/])/g

// Tickers too generic to resolve reliably: majors, stables, fiat, chain names, and cashtags of listed stocks.
export const EXCLUDED_TICKERS = new Set([
  'USD', 'USDC', 'USDT', 'USDG', 'USD1', 'DAI', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY',
  'ETH', 'WETH', 'BTC', 'WBTC', 'SOL', 'WSOL', 'BNB', 'WBNB', 'HYPE', 'WHYPE', 'XRP', 'ADA', 'DOGE', 'TRX', 'AVAX', 'DOT',
  'MATIC', 'POL', 'LINK', 'LTC', 'TON', 'ARB', 'OP', 'SUI', 'APT', 'NEAR', 'ATOM', 'BASE',
  'SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOG', 'GOOGL', 'META', 'HOOD',
])

// A run of base58 letters only (no digit) is almost always a word or a handle, not a mint.
const looksLikeMint = (s: string) => /\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s)

export interface Match { ref: Ref; index: number; length: number }

export function findTokens(text: string): Match[] {
  const out: Match[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = { index: m.index!, length: m[0].length }
    if (m[2]) out.push({ ref: { kind: 'ca', value: m[2].toLowerCase() }, ...at })
    else if (m[3]) { if (looksLikeMint(m[3])) out.push({ ref: { kind: 'ca', value: m[3] }, ...at }) }
    else {
      const sym = m[1].toUpperCase()
      if (!EXCLUDED_TICKERS.has(sym)) out.push({ ref: { kind: 'ticker', value: sym }, ...at })
    }
  }
  return out
}

const AXIOM_CHAINS: Record<string, ChainId> = { sol: 'solana', eth: 'ethereum', base: 'base', bnb: 'bsc', hype: 'hyperevm', robinhood: 'robinhood' }
const GMGN_CHAINS: Record<string, ChainId> = { sol: 'solana', eth: 'ethereum', base: 'base', bsc: 'bsc' }
const isAddress = (s: string) => EVM_ADDRESS.test(s) || SOLANA_ADDRESS.test(s)
const ca = (a: string): Ref => ({ kind: 'ca', value: normalizeAddress(a) })

// X keeps the full URL in a link's text (split into hidden spans, ending with "…"). Known trading and explorer
// links become a token or pair reference; anything else is ignored.
export function refFromLink(text: string): Ref | null {
  let url: URL
  try {
    url = new URL(text.trim().replace(/…$/, ''))
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  const last = parts.find(isAddress)
  if (!last) return null
  if (host === 'dexscreener.com' && isChainId(parts[0]) && parts[1]) return { kind: 'pair', chain: parts[0], value: normalizeAddress(parts[1]) }
  if (host === 'axiom.trade' && parts[0] === 'meme') {
    const chain = AXIOM_CHAINS[url.searchParams.get('chain') ?? 'sol']
    return chain ? { kind: 'pair', chain, value: normalizeAddress(parts[1]) } : null
  }
  if (host === 'gmgn.ai' && !(parts[0] in GMGN_CHAINS)) return null
  const known = ['pump.fun', 'axiom.trade', 'gmgn.ai', 'birdeye.so', 'solscan.io', 'etherscan.io', 'basescan.org', 'bscscan.com', 'photon-sol.tinyastro.io', 'bullx.io', 'neo.bullx.io']
  return known.includes(host) ? ca(last) : null
}
