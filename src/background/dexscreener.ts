import { normalizeAddress, type ChainId } from '../shared/chains'
import { rateLimit } from './limiter'

const API = 'https://api.dexscreener.com'
// Documented limit is 300 req/min on these endpoints; stay well under it.
const limited = rateLimit(250)

export interface Pair {
  chainId: string
  pairAddress: string
  baseToken: { address: string; name: string; symbol: string }
  quoteToken: { address: string; symbol: string }
  priceUsd?: string
  marketCap?: number
  fdv?: number
  liquidity?: { usd?: number }
  volume?: { h24?: number }
  priceChange?: { h24?: number }
  txns?: { h24?: { buys?: number; sells?: number } }
}

// Throws on failure so callers never cache a transient error as "no such token".
async function get<T>(path: string, retries = 2): Promise<T> {
  const res = await limited(() => fetch(API + path))
  if (res.ok) return res.json()
  if (retries > 0 && (res.status === 403 || res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 1500 * (3 - retries)))
    return get(path, retries - 1)
  }
  throw new Error(`dexscreener ${res.status}`)
}

// The orders endpoint has its own, lower limit (60 req/min).
const ordersLimited = rateLimit(50)

// True when the token's Dexscreener profile was paid for and approved ("DEX paid").
export async function dexPaid(chain: ChainId, address: string): Promise<boolean> {
  const res = await ordersLimited(() => fetch(`${API}/orders/v1/${chain}/${address}`))
  if (!res.ok) throw new Error(`dexscreener orders ${res.status}`)
  const { orders } = (await res.json()) as { orders?: { type: string; status: string }[] }
  return (orders ?? []).some((o) => o.type === 'tokenProfile' && o.status === 'approved')
}

const liq = (p: Pair) => p.liquidity?.usd ?? 0
const sameToken = (p: Pair, address: string) => normalizeAddress(p.baseToken.address) === normalizeAddress(address)
const symbolOf = (p: Pair) => p.baseToken.symbol.trim().replace(/^\$/, '').toUpperCase()

// Liquidity is self-reported by the pool and easy to fake (a "$WIF" pool shows $2.1B with $2 of volume).
// Only pairs that actually trade count when choosing between tokens.
const active = (p: Pair) => (p.volume?.h24 ?? 0) >= 1_000 || (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0) >= 20

// The deepest pair whose price agrees with the median of the token's pairs, so one broken pool
// (BONK/USELESS quotes BONK 16,000× too high) can't set the price.
function consensusPair(pairs: Pair[]): Pair | null {
  const pool = pairs.filter(active).length ? pairs.filter(active) : pairs
  if (!pool.length) return null
  const prices = pool.map((p) => Number(p.priceUsd)).filter((x) => x > 0).sort((a, b) => a - b)
  const median = prices[Math.floor(prices.length / 2)]
  const agree = pool.filter((p) => Math.abs(Number(p.priceUsd) / median - 1) <= 0.25)
  return (agree.length ? agree : pool).sort((a, b) => liq(b) - liq(a))[0]
}

// Robinhood Chain pairs where `address` is the base token (prices the Pons curves' quote tokens).
export async function robinhoodPair(address: string): Promise<Pair | null> {
  const pairs = await get<Pair[]>(`/token-pairs/v1/robinhood/${address}`)
  return consensusPair((pairs ?? []).filter((p) => p.chainId === 'robinhood' && sameToken(p, address) && p.priceUsd))
}

// The best pair for `address` on the allowed chains. The same 0x address can exist on several EVM chains
// (often a different token each time): the chain where it has the most active liquidity wins.
export async function bestPairFor(address: string, chains: readonly ChainId[]): Promise<Pair | null> {
  const { pairs } = await get<{ pairs: Pair[] | null }>(`/latest/dex/tokens/${address}`)
  const ok = (pairs ?? []).filter((p) => (chains as readonly string[]).includes(p.chainId) && sameToken(p, address) && p.priceUsd)
  if (!ok.length) return null
  const byChain = new Map<string, number>()
  for (const p of ok) byChain.set(p.chainId, (byChain.get(p.chainId) ?? 0) + (active(p) ? liq(p) : 0))
  const chain = [...byChain].sort((a, b) => b[1] - a[1])[0][0]
  return consensusPair(ok.filter((p) => p.chainId === chain))
}

// The pair behind a Dexscreener/Axiom link. Some links carry a token address instead: then nothing is found here.
export async function pairByAddress(chain: ChainId, pair: string): Promise<Pair | null> {
  const { pairs } = await get<{ pairs: Pair[] | null }>(`/latest/dex/pairs/${chain}/${pair}`)
  return pairs?.[0] ?? null
}

export interface Candidate { chain: ChainId; address: string; liquidityUsd: number }

// Every token on the allowed chains whose symbol is `ticker` (Dexscreener lists some as "$WIF"),
// with the liquidity of its actively traded pairs summed.
export async function tickerCandidates(ticker: string, chains: readonly ChainId[]): Promise<Candidate[]> {
  const results = await Promise.all([ticker, `$${ticker}`].map((q) => get<{ pairs: Pair[] | null }>(`/latest/dex/search?q=${encodeURIComponent(q)}`)))
  const seen = new Set<string>()
  const byToken = new Map<string, Candidate>()
  for (const p of results.flatMap((r) => r.pairs ?? [])) {
    if (seen.has(p.pairAddress)) continue
    seen.add(p.pairAddress)
    if (!(chains as readonly string[]).includes(p.chainId) || symbolOf(p) !== ticker || !active(p)) continue
    const address = normalizeAddress(p.baseToken.address)
    const key = `${p.chainId}:${address}`
    const c = byToken.get(key) ?? { chain: p.chainId as ChainId, address, liquidityUsd: 0 }
    c.liquidityUsd += liq(p)
    byToken.set(key, c)
  }
  return [...byToken.values()]
}
