import { rateLimit } from './limiter'

// Our ticker index for Pons V2 tokens still on their bonding curve (Dexscreener doesn't list them). Source: indexer/.
export const INDEXER_URL: string = import.meta.env.VITE_INDEXER_URL ?? 'https://buybutton-indexer.vercel.app'
const limited = rateLimit(120)

export async function curveCandidate(ticker: string): Promise<{ address: string; liquidityUsd: number } | null> {
  const res = await limited(() => fetch(`${INDEXER_URL}/api/resolve?ticker=${encodeURIComponent(ticker)}`))
  if (!res.ok) throw new Error(`indexer ${res.status}`)
  const { token } = (await res.json()) as { token: { address: string; liquidityUsd: number } | null }
  return token && /^0x[0-9a-f]{40}$/i.test(token.address)
    ? { address: token.address.toLowerCase(), liquidityUsd: token.liquidityUsd }
    : null
}
