import { MULTICALL_BYTES, WETH, client, curveAbi } from './chain.js'
import { quoteInfo } from './prices.js'
import { normalizeSymbol, type Store } from './store.js'

// Copycats are common (22 × $NASCAT); only the most recent ones are ranked.
const MAX_CANDIDATES = 60

export interface Resolved { address: string; symbol: string; liquidityUsd: number; curve: string }

// The V2 token with this symbol that has the most real liquidity still on its bonding curve.
export async function resolveTicker(store: Store, ticker: string): Promise<Resolved | null> {
  const symbol = normalizeSymbol(ticker)
  if (!symbol) return null
  const cands = await store.candidates(symbol, MAX_CANDIDATES)
  if (!cands.length) return null

  const reads = cands.flatMap((c) => (['realQuoteReserve', 'graduated', 'isNativeQuote', 'pairToken'] as const).map((functionName) => ({ address: c.curve as `0x${string}`, abi: curveAbi, functionName })))
  const res = await client.multicall({ allowFailure: true, batchSize: MULTICALL_BYTES, contracts: reads })

  const live = cands
    .map((c, i) => {
      const [real, graduated, native, pair] = res.slice(i * 4, i * 4 + 4).map((r) => (r.status === 'success' ? r.result : null))
      if (real == null || graduated !== false) return null
      return { ...c, rawReal: real as bigint, quote: (native ? WETH : (pair as string)).toLowerCase() }
    })
    .filter((c): c is NonNullable<typeof c> => c != null && c.rawReal > 0n)
  if (!live.length) return null

  // Curves can be quoted in ETH, USDG, cbBTC or tokenized stocks: price and decimals per quote token.
  const infos = new Map<string, Awaited<ReturnType<typeof quoteInfo>>>()
  for (const q of new Set(live.map((c) => c.quote))) infos.set(q, await quoteInfo(q).catch(() => null))
  const ranked = live
    .map((c) => {
      const info = infos.get(c.quote)
      return { ...c, usd: info ? (Number(c.rawReal) / info.scale) * info.usd : 0 }
    })
    .sort((a, b) => b.usd - a.usd)
  const best = ranked[0]
  return best.usd > 0 ? { address: best.token, symbol, liquidityUsd: best.usd, curve: best.curve } : null
}
