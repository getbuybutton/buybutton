import type { ChainId } from './chains'

export interface TokenInfo {
  name: string
  symbol: string
  priceUsd: number
  marketCapUsd: number | null
  change24h: number | null
  imageUrl: string | null
}

interface Pair {
  chainId: string
  baseToken: { address: string; name: string; symbol: string }
  priceUsd?: string
  marketCap?: number
  fdv?: number
  liquidity?: { usd?: number }
  priceChange?: { h24?: number }
  info?: { imageUrl?: string }
}

// Deepest Dexscreener pair for this token on this chain.
export async function loadToken(chain: ChainId, address: string): Promise<TokenInfo | null> {
  const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain}/${address}`)
  if (!res.ok) throw new Error(`Dexscreener ${res.status}`)
  const pairs = ((await res.json()) as Pair[])
    .filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase() && p.priceUsd)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
  const p = pairs[0]
  if (!p) return null
  return {
    name: p.baseToken.name,
    symbol: p.baseToken.symbol.replace(/^\$/, ''),
    priceUsd: Number(p.priceUsd),
    marketCapUsd: p.marketCap ?? p.fdv ?? null,
    change24h: p.priceChange?.h24 ?? null,
    imageUrl: pairs.find((x) => x.info?.imageUrl)?.info?.imageUrl ?? null,
  }
}

export async function ethUsd(): Promise<number> {
  const res = await fetch('https://api.dexscreener.com/token-pairs/v1/base/0x4200000000000000000000000000000000000006')
  const pairs = (await res.json()) as Pair[]
  const best = pairs
    .filter((p) => p.baseToken.address.toLowerCase() === '0x4200000000000000000000000000000000000006' && p.priceUsd)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
  if (!best) throw new Error('No ETH price')
  return Number(best.priceUsd)
}
