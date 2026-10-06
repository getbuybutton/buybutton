import { toHex } from 'viem'
import { FACTORY_V2, FIRST_LAUNCH_BLOCK, MULTICALL_BYTES, TOKEN_LAUNCHED_TOPIC, WETH, client, curveAbi, erc20Abi } from './chain.js'
import { quoteInfo } from './prices.js'
import { normalizeSymbol, type Launch, type Store } from './store.js'

// Measured best on the public RPC: 125 curves (500 reads) per multicall, 8 in flight ≈ 275 launches/s.
const PARALLEL_MULTICALLS = 8
// Launches younger than this are all indexed; older ones only if their curve is still worth finding.
const RECENT_BLOCKS = 2_600_000n // ~3 days
const MIN_OLD_LIQUIDITY_USD = 100
// The RPC caps eth_getLogs at 10M blocks and 10k logs; ~4k launches/day ≈ 850k blocks/day.
const MAX_SPAN = 5_000_000n
const TARGET_LOGS = 4_000

// Remembered between runs in the same process, so a backfill doesn't restart from a small span each time.
let lastSpan = 200_000n

export interface SyncResult { from: string; to: string; launches: number; caughtUp: boolean; ms: number }

// Indexes TokenLaunched events from the stored cursor toward the head, within a time budget.
export async function sync(store: Store, budgetMs: number): Promise<SyncResult | null> {
  if (!(await store.lock(Math.ceil(budgetMs / 1000) + 30))) return null
  const started = Date.now()
  try {
    const head = await client.getBlockNumber()
    const start = ((await store.getLastBlock()) ?? FIRST_LAUNCH_BLOCK - 1n) + 1n
    let from = start
    let span = lastSpan
    let total = 0
    while (from <= head && Date.now() - started < budgetMs) {
      const to = from + span - 1n > head ? head : from + span - 1n
      let logs
      try {
        // Raw call: the event's full signature isn't known (ABI rebuilt from bytecode), only its topic.
        logs = await client.request({
          method: 'eth_getLogs',
          params: [{ address: FACTORY_V2, topics: [TOKEN_LAUNCHED_TOPIC], fromBlock: toHex(from), toBlock: toHex(to) }],
        })
      } catch (e) {
        if (/exceeds limit|spans/i.test(String((e as any)?.details ?? e)) && span > 1_000n) { span /= 2n; continue }
        throw e
      }
      const launches = await withSymbols(
        to + RECENT_BLOCKS < head,
        logs.map((l) => ({ token: ('0x' + l.topics[1]!.slice(26)).toLowerCase(), curve: ('0x' + l.topics[2]!.slice(26)).toLowerCase(), block: Number(l.blockNumber) })),
      )
      await store.commit(launches, to)
      total += launches.length
      from = to + 1n
      // Aim for ~TARGET_LOGS per query: long spans while backfilling quiet periods, short ones on busy days.
      const next = logs.length ? (span * BigInt(TARGET_LOGS)) / BigInt(logs.length) : span * 2n
      span = next < 1_000n ? 1_000n : next > MAX_SPAN ? MAX_SPAN : next
      lastSpan = span
    }
    return { from: start.toString(), to: (from - 1n).toString(), launches: total, caughtUp: from > head, ms: Date.now() - started }
  } finally {
    await store.unlock()
  }
}

async function withSymbols(old: boolean, items: Omit<Launch, 'symbol'>[]): Promise<Launch[]> {
  // Old ranges: check curve state first (cheap filter, ~99% dropped), then fetch symbols for the survivors only.
  const keep = old ? (await inBatches(items, 125, aliveFilter)).flat() : items
  return (await inBatches(keep, 200, readSymbols)).flat()
}

async function inBatches<T, R>(items: T[], size: number, fn: (batch: T[]) => Promise<R>): Promise<R[]> {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  const out: R[] = []
  for (let i = 0; i < batches.length; i += PARALLEL_MULTICALLS) out.push(...(await Promise.all(batches.slice(i, i + PARALLEL_MULTICALLS).map(fn))))
  return out
}

// Keeps old launches still on their curve with at least MIN_OLD_LIQUIDITY_USD of real reserve.
async function aliveFilter<T extends { curve: string }>(batch: T[]): Promise<T[]> {
  const res = await client.multicall({
    allowFailure: true,
    batchSize: MULTICALL_BYTES,
    contracts: batch.flatMap((b) => {
      const curve = b.curve as `0x${string}`
      return (['graduated', 'realQuoteReserve', 'isNativeQuote', 'pairToken'] as const).map((functionName) => ({ address: curve, abi: curveAbi, functionName }))
    }),
  })
  const out: T[] = []
  for (const [j, b] of batch.entries()) {
    const [graduated, real, native, pair] = res.slice(j * 4, j * 4 + 4).map((r) => (r.status === 'success' ? r.result : null))
    // Graduated: its pool is on Dexscreener. Drained: nobody will look it up by ticker.
    if (graduated !== false || !real) continue
    const info = await quoteInfo(native ? WETH : (pair as string)).catch(() => null)
    if (info && (Number(real as bigint) / info.scale) * info.usd >= MIN_OLD_LIQUIDITY_USD) out.push(b)
  }
  return out
}

async function readSymbols(batch: Omit<Launch, 'symbol'>[]): Promise<Launch[]> {
  const res = await client.multicall({
    allowFailure: true,
    batchSize: MULTICALL_BYTES,
    contracts: batch.map((b) => ({ address: b.token as `0x${string}`, abi: erc20Abi, functionName: 'symbol' as const })),
  })
  const out: Launch[] = []
  for (const [j, b] of batch.entries()) {
    const symbol = res[j].status === 'success' ? normalizeSymbol(res[j].result as string) : null
    if (symbol) out.push({ ...b, symbol })
  }
  return out
}
