import { Redis } from '@upstash/redis'

export interface Launch { token: string; curve: string; symbol: string; block: number }

export interface Store {
  getLastBlock(): Promise<bigint | null>
  // Writes launches and advances the cursor together, so an interrupted sync resumes where it stopped.
  commit(launches: Launch[], lastBlock: bigint): Promise<void>
  candidates(symbol: string, limit: number): Promise<{ token: string; curve: string }[]>
  lock(ttlSec: number): Promise<boolean>
  unlock(): Promise<void>
  stats(): Promise<{ lastBlock: string | null; tokens: number }>
}

const K = { last: 'v2:lastBlock', lock: 'v2:lock', curves: 'v2:curve', sym: (s: string) => `v2:sym:${s}` }

export function normalizeSymbol(s: string): string | null {
  const v = s.trim().replace(/^\$/, '').toUpperCase()
  return /^[A-Z0-9]{1,20}$/.test(v) ? v : null
}

class RedisStore implements Store {
  constructor(private r: Redis) {}
  async getLastBlock() {
    const v = await this.r.get<string>(K.last)
    return v == null ? null : BigInt(v)
  }
  async commit(launches: Launch[], lastBlock: bigint) {
    // One ZADD per symbol, not per token: launches come in waves of copycats, and Upstash bills per command.
    const bySymbol = new Map<string, { score: number; member: string }[]>()
    for (const l of launches) {
      const list = bySymbol.get(l.symbol) ?? []
      list.push({ score: l.block, member: l.token })
      bySymbol.set(l.symbol, list)
    }
    const p = this.r.multi()
    for (const [sym, [first, ...rest]] of bySymbol) p.zadd(K.sym(sym), first, ...rest)
    if (launches.length) p.hset(K.curves, Object.fromEntries(launches.map((l) => [l.token, l.curve])))
    p.set(K.last, lastBlock.toString())
    await p.exec()
  }
  async candidates(symbol: string, limit: number) {
    const tokens = await this.r.zrange<string[]>(K.sym(symbol), 0, limit - 1, { rev: true })
    if (!tokens.length) return []
    const curves = await this.r.hmget<Record<string, string>>(K.curves, ...tokens)
    return tokens.map((token) => ({ token, curve: curves?.[token] ?? '' })).filter((c) => c.curve)
  }
  async lock(ttlSec: number) {
    return (await this.r.set(K.lock, '1', { nx: true, ex: ttlSec })) === 'OK'
  }
  async unlock() {
    await this.r.del(K.lock)
  }
  async stats() {
    return { lastBlock: await this.r.get<string>(K.last), tokens: await this.r.hlen(K.curves) }
  }
}

// For local runs without Redis.
export class MemoryStore implements Store {
  last: bigint | null = null
  syms = new Map<string, { token: string; block: number }[]>()
  curves = new Map<string, string>()
  locked = false
  async getLastBlock() { return this.last }
  async commit(launches: Launch[], lastBlock: bigint) {
    for (const l of launches) {
      const list = this.syms.get(l.symbol) ?? []
      if (!list.some((x) => x.token === l.token)) list.push({ token: l.token, block: l.block })
      this.syms.set(l.symbol, list)
      this.curves.set(l.token, l.curve)
    }
    this.last = lastBlock
  }
  async candidates(symbol: string, limit: number) {
    return [...(this.syms.get(symbol) ?? [])].sort((a, b) => b.block - a.block).slice(0, limit)
      .map(({ token }) => ({ token, curve: this.curves.get(token)! }))
  }
  async lock() { if (this.locked) return false; return (this.locked = true) }
  async unlock() { this.locked = false }
  async stats() { return { lastBlock: this.last?.toString() ?? null, tokens: this.curves.size } }
}

let store: Store | null = null
export function getStore(): Store {
  if (store) return store
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  store = url && token ? new RedisStore(new Redis({ url, token })) : new MemoryStore()
  return store
}
export function setStore(s: Store) { store = s }
