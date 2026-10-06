// ?harness      → content script runs in the page with mock data, no extension needed.
// ?harness=live → same, but quotes come from the real background logic (Dexscreener + Pons curve).
// No param      → plain target page for the installed dev extension.
import { mockQuote } from '../src/shared/mock'
import type { Message } from '../src/shared/types'

const mode = new URLSearchParams(location.search).get('harness')
if (mode != null) {
  const live = mode === 'live'
  const { quote } = live ? await import('../src/background/quote') : { quote: null }
  await import('./storage-shim')
  // The preview pane can run hidden, where IntersectionObserver never fires: &eager treats every badge as visible.
  if (new URLSearchParams(location.search).has('eager')) {
    ;(globalThis as any).IntersectionObserver = class {
      constructor(private cb: (e: { isIntersecting: boolean; target: Element }[]) => void) {}
      observe(target: Element) { setTimeout(() => this.cb([{ isIntersecting: true, target }])) }
      unobserve() {}
      disconnect() {}
    }
  }
  ;(globalThis as any).chrome.runtime = {
    id: "harness",
    sendMessage: async (m: Message) => {
        if (m.type === 'safety') {
          if (!live) return m.address.endsWith('pump') ? { items: [{ label: 'top 10 holders', value: '68%', ok: false }, { label: 'dev wallet', value: '12%', ok: false }, { label: 'mint authority', value: 'renounced', ok: true }, { label: 'liquidity locked', value: '0%', ok: null }], flags: 2 } : { items: [{ label: 'dev wallet', value: '0%', ok: true }], flags: 0 }
          const { safety } = await import('../src/background/safety')
          return safety(m.chain, m.address).catch(() => null)
        }
        if (m.type === 'dexpaid') {
          if (!live) return m.address.endsWith('pump')
          const { dexPaid } = await import('../src/background/dexscreener')
          return dexPaid(m.chain, m.address).catch(() => false)
        }
        if (m.type === 'trade') {
          const { buyPageUrl, loadSettings } = await import('../src/shared/settings')
          const { terminalUrl, pumpfunUrl } = await import('../src/shared/terminals')
          const st = await loadSettings()
          const url = m.venue === 'applepay' ? buyPageUrl(st, m.chain, m.address, m.amount) : m.venue === 'pumpfun' ? pumpfunUrl(m.address) : terminalUrl(st, m.chain, m.address)
          ;(window as any).__lastTrade = url
          ;(window as any).__lastAnchor = m.anchor
          console.log('[harness] would open', url)
          return
        }
        if (live) {
          const r = { quote: await quote!(m.ref).catch((e) => (console.warn(e), null)) }
          ;((window as any).__quoteTimes ??= []).push(Math.round(performance.now()))
          return r
        }
        return live ? null : new Promise((r) => setTimeout(() => r({ quote: mockQuote(m.ref) }), 200))
    },
  }
  document.getElementById('mode')!.textContent = live ? 'harness live (vraies données, sans extension)' : 'harness (mock, sans extension)'
  import('../src/content/index')
}
