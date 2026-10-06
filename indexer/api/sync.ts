import { getStore } from '../lib/store.js'
import { sync } from '../lib/sync.js'

// Daily cron (and manual catch-up). Protected by CRON_SECRET when set.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 })
  const store = getStore()
  const result = await sync(store, 50_000)
  return Response.json({ result, stats: await store.stats() })
}
