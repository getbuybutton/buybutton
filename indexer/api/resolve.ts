import { waitUntil } from '@vercel/functions'
import { getStore } from '../lib/store.js'
import { resolveTicker } from '../lib/resolve.js'
import { sync } from '../lib/sync.js'

const HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  // Shared by every user through the CDN; matches the extension's 30 s price cache.
  'cache-control': 'public, s-maxage=30, stale-while-revalidate=60',
}

// GET /api/resolve?ticker=ABC → { token: { address, symbol, liquidityUsd, curve } | null }
export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get('ticker') ?? ''
  if (!/^\$?[A-Za-z0-9]{1,20}$/.test(ticker)) return new Response(JSON.stringify({ error: 'bad ticker' }), { status: 400, headers: HEADERS })
  const store = getStore()
  // Keeps the index fresh between daily crons; the lock makes concurrent calls a no-op.
  waitUntil(sync(store, 20_000).catch((e) => console.error('sync', e)))
  const token = await resolveTicker(store, ticker)
  return new Response(JSON.stringify({ token }), { headers: HEADERS })
}
