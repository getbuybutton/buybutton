import { CHAINS, EVM_ADDRESS, normalizeAddress, type ChainId } from '../shared/chains'
import { loadSettings } from '../shared/settings'
import type { Quote, Ref } from '../shared/types'
import { TtlCache } from './cache'
import { bestPairFor, pairByAddress, robinhoodPair, tickerCandidates, type Candidate, type Pair } from './dexscreener'
import { curveCandidate } from './indexer'
import { PONS_SUPPLY, WETH, readCurve } from './pons'

const quotes = new TtlCache<Quote | null>(30_000, 2000, 'quotes')
const tickers = new TtlCache<Candidate | null>(10 * 60_000, 2000, 'tickers')
const usdPrices = new TtlCache<number | null>(30_000)

function fromPair(p: Pair): Quote {
  return {
    chain: p.chainId as ChainId,
    address: normalizeAddress(p.baseToken.address),
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    priceUsd: Number(p.priceUsd),
    marketCapUsd: p.marketCap ?? p.fdv ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    change24h: p.priceChange?.h24 ?? null,
    source: 'dexscreener',
  }
}

// USD price of a Pons curve's quote asset (WETH or a pair token), from its deepest Robinhood Chain pair.
function usdPrice(address: string) {
  return usdPrices.get(address.toLowerCase(), async () => {
    const best = await robinhoodPair(address)
    return best ? Number(best.priceUsd) : null
  })
}

async function loadQuote(address: string, chains: readonly ChainId[]): Promise<Quote | null> {
  let dsError: unknown = null
  const best = await bestPairFor(address, chains).catch((e) => ((dsError = e), null))
  if (best) return fromPair(best)

  // Not on any DEX yet: most fresh Pons launches are still on their bonding curve (Robinhood Chain only).
  // A failed read rejects, so the TTL cache drops it instead of remembering "nothing here".
  const curve = chains.includes('robinhood') && EVM_ADDRESS.test(address) ? await readCurve(address as `0x${string}`) : null
  if (!curve) {
    if (dsError) throw dsError
    return null
  }
  const quoteUsd = await usdPrice(curve.quoteToken === WETH ? WETH : curve.quoteToken)
  if (!quoteUsd) return null
  const priceUsd = curve.priceInQuote * quoteUsd
  return {
    chain: 'robinhood', address, symbol: curve.symbol, name: curve.name, priceUsd,
    marketCapUsd: priceUsd * PONS_SUPPLY,
    liquidityUsd: curve.realQuote * quoteUsd,
    change24h: null,
    source: 'pons-curve',
    curveProgress: curve.progress,
  }
}

// Below this, a ticker match is too easy to fake with a copycat to be trusted. Robinhood Chain is young and
// its Pons curves are small, so it gets a lower bar than the big memecoin chains where copycats are everywhere.
const MIN_TICKER_LIQUIDITY_USD = (c: ChainId) => (c === 'robinhood' ? 1_000 : 10_000)

// Most liquid token with this exact symbol: Dexscreener (every enabled chain) and our index of Pons curves.
async function resolveTicker(ticker: string, chains: readonly ChainId[]): Promise<Candidate | null> {
  const [ds, curve] = await Promise.allSettled([
    tickerCandidates(ticker, chains),
    chains.includes('robinhood') ? curveCandidate(ticker) : Promise.resolve(null),
  ])
  if (ds.status === 'rejected' && curve.status === 'rejected') throw ds.reason
  const all: Candidate[] = [
    ...(ds.status === 'fulfilled' ? ds.value : []),
    ...(curve.status === 'fulfilled' && curve.value ? [{ chain: 'robinhood' as const, ...curve.value }] : []),
  ]
  const best = all.filter((c) => c.liquidityUsd >= MIN_TICKER_LIQUIDITY_USD(c.chain)).sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0]
  return best ?? null
}

export async function quote(ref: Ref): Promise<Quote | null> {
  const { chains } = await loadSettings()
  if (!chains.length) return null
  const key = [...chains].sort().join(',')
  if (ref.kind === 'ticker') {
    const hit = await tickers.get(`${key}:${ref.value}`, () => resolveTicker(ref.value, chains))
    return hit ? quotes.get(`${hit.chain}:${hit.address}`, () => loadQuote(hit.address, [hit.chain])) : null
  }
  if (ref.kind === 'pair') {
    if (!chains.includes(ref.chain)) return null
    // Resolve the pair to its base token, then price that token like any CA (deepest, consensus pair).
    const token = await tickers.get(`pair:${ref.chain}:${ref.value}`, async () => {
      const p = await pairByAddress(ref.chain, ref.value)
      return { chain: ref.chain, address: p ? normalizeAddress(p.baseToken.address) : ref.value, liquidityUsd: 0 }
    })
    return token ? quotes.get(`${token.chain}:${token.address}`, () => loadQuote(token.address, [token.chain])) : null
  }
  // EVM addresses can't be checked against non-EVM chains and vice versa.
  const evm = ref.value.startsWith('0x')
  const candidates = chains.filter((c) => CHAINS[c].evm === evm)
  return candidates.length ? quotes.get(`${key}:${ref.value}`, () => loadQuote(ref.value, candidates)) : null
}
