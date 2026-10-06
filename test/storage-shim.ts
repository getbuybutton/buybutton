// Minimal chrome.storage.sync backed by localStorage, for running the popup and content script outside the extension.
const KEY = 'bb-settings'
const listeners: ((changes: Record<string, { newValue: unknown }>, area: string) => void)[] = []
const readAll = (): Record<string, unknown> => JSON.parse(localStorage.getItem(KEY) ?? '{}')

const g = globalThis as any
g.chrome ??= {}
g.chrome.storage = {
  sync: {
    get: async (defaults: Record<string, unknown>) => ({ ...defaults, ...readAll() }),
    set: async (items: Record<string, unknown>) => {
      localStorage.setItem(KEY, JSON.stringify({ ...readAll(), ...items }))
      const changes = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { newValue: v }]))
      listeners.forEach((l) => l(changes, 'sync'))
    },
  },
  onChanged: { addListener: (l: (typeof listeners)[number]) => listeners.push(l) },
}
// Other tabs on the same origin (the fake timeline) see popup saves through the storage event.
addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return
  const v = JSON.parse(e.newValue)
  listeners.forEach((l) => l(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, { newValue: x }])), 'sync'))
})
export {}
