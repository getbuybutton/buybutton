// At most `perMinute` calls in any 60 s window. Calls go out immediately while there's room (a timeline
// loads 20 badges at once), and only queue once the window is full. Spacing every call out evenly made the
// last badges on a page wait 10 s for nothing.
export function rateLimit(perMinute: number) {
  const sent: number[] = []
  let chain = Promise.resolve()
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const slot = chain.then(async () => {
      for (;;) {
        const now = Date.now()
        while (sent.length && sent[0] <= now - 60_000) sent.shift()
        if (sent.length < perMinute) break
        await new Promise((r) => setTimeout(r, sent[0] + 60_000 - now))
      }
      sent.push(Date.now())
    })
    chain = slot
    return slot.then(fn)
  }
}
