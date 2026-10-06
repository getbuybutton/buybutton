// Local server with an in-memory index of the last N blocks, for testing without Redis.
//   npx tsx scripts/local.ts [blocks=400000]
import { createServer } from 'node:http'
import { client } from '../lib/chain.js'
import { MemoryStore, setStore } from '../lib/store.js'
import { sync } from '../lib/sync.js'
import { GET as resolve } from '../api/resolve.js'

const store = new MemoryStore()
setStore(store)
const blocks = BigInt(process.argv[2] ?? 400_000)
store.last = (await client.getBlockNumber()) - blocks
const r = await sync(store, 120_000)
console.log('indexed', r, await store.stats())

createServer(async (req, res) => {
  const out = await resolve(new Request(`http://localhost${req.url}`))
  res.writeHead(out.status, Object.fromEntries(out.headers))
  res.end(await out.text())
}).listen(5175, () => console.log('http://localhost:5175/api/resolve?ticker=…'))
