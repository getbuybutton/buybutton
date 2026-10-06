import { getStore } from '../lib/store.js'

// DefiLlama names for the six chains the extension covers.
const LLAMA_CHAINS = ['Solana', 'Ethereum', 'Base', 'BSC', 'Hyperliquid L1', 'Robinhood']

async function dexVolume24h(): Promise<number | null> {
  const totals = await Promise.all(
    LLAMA_CHAINS.map((c) =>
      fetch(`https://api.llama.fi/overview/dexs/${encodeURIComponent(c)}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (typeof d?.total24h === 'number' ? d.total24h : null))
        .catch(() => null),
    ),
  )
  // Only report a total when every chain answered, so the number never silently shrinks.
  return totals.every((t) => t != null) ? totals.reduce((a, b) => a + (b as number), 0) : null
}

// Public numbers for the site's counters. Cached on the CDN for 10 minutes.
export async function GET() {
  const [{ lastBlock, tokens }, volume24h] = await Promise.all([getStore().stats(), dexVolume24h()])
  return new Response(JSON.stringify({ tokens, lastBlock, volume24h }), {
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=1800',
    },
  })
}
