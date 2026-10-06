// TTL cache that also coalesces concurrent lookups of the same key into one request.
// With `persistAs`, entries also go to chrome.storage.session: Chrome stops the service worker after
// 30 s idle, which used to wipe the cache and refetch every coin when the user scrolled back.
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>()
  private inflight = new Map<string, Promise<V>>()
  private hydrated: Promise<void>
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private ttlMs: number, private max = 2000, private persistAs?: string) {
    const session = persistAs ? globalThis.chrome?.storage?.session : undefined
    this.hydrated = session
      ? session.get(persistAs!).then(
          (r) => {
            const now = Date.now()
            for (const [k, e] of Object.entries((r[persistAs!] ?? {}) as Record<string, { value: V; expires: number }>))
              if (e.expires > now && !this.store.has(k)) this.store.set(k, e)
          },
          () => {},
        )
      : Promise.resolve()
  }

  private save() {
    const session = this.persistAs ? globalThis.chrome?.storage?.session : undefined
    if (!session || this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      const now = Date.now()
      const live = Object.fromEntries([...this.store].filter(([, e]) => e.expires > now))
      session.set({ [this.persistAs!]: live }).catch(() => {})
    }, 1000)
  }

  async get(key: string, load: () => Promise<V>): Promise<V> {
    const fast = this.store.get(key)
    if (!fast) await this.hydrated
    const h = this.store.get(key)
    if (h && h.expires > Date.now()) return h.value
    const running = this.inflight.get(key)
    if (running) return running
    const p = load()
      .then((value) => {
        if (this.store.size >= this.max) this.store.delete(this.store.keys().next().value!)
        this.store.set(key, { value, expires: Date.now() + this.ttlMs })
        this.save()
        return value
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, p)
    return p
  }
}
