// One-off: index every V2 launch since the factory went live. Run with the Redis env vars set:
//   vercel env pull .env.local && npx tsx --env-file=.env.local scripts/backfill.ts
import { getStore } from '../lib/store.js'
import { sync } from '../lib/sync.js'

const store = getStore()
for (;;) {
  const r = await sync(store, 45_000)
  if (!r) { console.log('locked by another sync, retrying in 10 s'); await new Promise((x) => setTimeout(x, 10_000)); continue }
  console.log(`blocks ${r.from}…${r.to}: +${r.launches} launches in ${r.ms} ms`, await store.stats())
  if (r.caughtUp) break
}
