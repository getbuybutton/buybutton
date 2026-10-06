import { CHAIN_IDS } from './chains'
import type { Quote, Ref } from './types'

// Step 2: fake data only. Real Dexscreener + Pons curve sources come in step 3.
function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

export function mockQuote(ref: Ref): Quote | null {
  // Lets the test page show the "no reliable match → nothing" path.
  if (ref.kind === 'ticker' && ref.value.startsWith('NOPE')) return null
  const h = hash(ref.value)
  const price = (h % 100000) / 10 ** (2 + (h % 7))
  const symbol = ref.kind === 'ticker' ? ref.value : 'MOCK' + (h % 100)
  const address = ref.kind === 'ca' ? ref.value : `0x${h.toString(16).padStart(8, '0').repeat(5)}`
  const chain = ref.kind === 'pair' ? ref.chain : ref.kind === 'ca' && !ref.value.startsWith('0x') ? 'solana' : CHAIN_IDS[h % CHAIN_IDS.length]
  return { chain, address, symbol, name: symbol, priceUsd: price, marketCapUsd: price * 1e9, liquidityUsd: (h % 500) * 1000, change24h: ((h % 4000) - 1500) / 100, source: 'mock' }
}

