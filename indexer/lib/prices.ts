import { client, erc20Abi } from './chain.js'

type Info = { usd: number; scale: number } | null
const cache = new Map<string, { v: Info; at: number }>()
const inflight = new Map<string, Promise<Info>>()

// USD price (deepest Dexscreener pair) and 10^decimals of a curve's quote token, cached 60 s.
export function quoteInfo(address: string): Promise<Info> {
  const key = address.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 60_000) return Promise.resolve(hit.v)
  const running = inflight.get(key)
  if (running) return running
  const p = load(key).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

async function load(key: string): Promise<Info> {
  const [pairs, decimals] = await Promise.all([
    fetch(`https://api.dexscreener.com/token-pairs/v1/robinhood/${key}`).then((r) => (r.ok ? (r.json() as Promise<any[]>) : [])),
    client.readContract({ address: key as `0x${string}`, abi: erc20Abi, functionName: 'decimals' }).catch(() => null),
  ])
  const best = pairs
    .filter((p) => p.baseToken?.address?.toLowerCase() === key && p.priceUsd)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0]
  const v = best && decimals != null ? { usd: Number(best.priceUsd), scale: 10 ** Number(decimals) } : null
  cache.set(key, { v, at: Date.now() })
  return v
}
