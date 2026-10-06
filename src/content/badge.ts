import type { Quote, Ref, Safety } from '../shared/types'
import { flatChange, formatChange, formatPrice, formatUsdCompact } from '../shared/format'
import { CHAINS, CHAIN_ICONS } from '../shared/chains'
import { buildMenu, fillSafety, menuLayer, menuLayerHost, placeMenu } from './menu'

const CSS = `
:host { all: initial; display: inline-block; vertical-align: middle; margin: 0 2px 0 4px; line-height: 1; }
:host([hidden]) { display: none; }
.b {
  display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 2px 0 7px;
  border: 1px solid var(--bd); border-radius: 999px; background: var(--bg); color: var(--fg);
  font: 600 11.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-variant-numeric: tabular-nums; white-space: nowrap; cursor: default;
}
:host { --bg: #f4f6f8; --fg: #0f1419; --mut: #536471; --bd: #dfe5ea; --acc: #00c805; --acc-fg: #04210a; --pop: #fff; --hov: #f2f4f6; }
:host([theme="dark"]) { --bg: #16181c; --fg: #e7e9ea; --mut: #8b98a5; --bd: #2f3336; --pop: #000; --hov: #16181c; }
.mc { color: var(--fg); font-weight: 700; } .mc small { color: var(--mut); font-weight: 500; font-size: 10px; margin-right: 3px; }
.rc { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 800; } .rc svg { width: 13px; height: 13px; display: block; }
.rc.ok { color: #00a804; } .rc.bad { color: #f23645; }
:host([theme="dark"]) .rc.ok { color: #00c805; }
.dx { display: inline-flex; } .dx img { width: 13px; height: 13px; border-radius: 3px; display: block; }
.flat { color: var(--mut); } .up { color: #00a804; } .down { color: #f23645; }
:host([theme="dark"]) .up { color: #00c805; } :host([theme="dark"]) .down { color: #ff5c6c; }
.ch { display: inline-flex; color: var(--fg); } .ch svg { width: 12px; height: 12px; display: block; }
.cv { position: relative; width: 22px; height: 4px; border-radius: 2px; background: var(--bd); overflow: hidden; }
.cv i { position: absolute; inset: 0 auto 0 0; background: var(--acc); }
.sk { width: 64px; height: 8px; border-radius: 4px; background: var(--bd); animation: p 1s ease-in-out infinite alternate; }
@keyframes p { to { opacity: .4 } }
button {
  all: unset; box-sizing: border-box; height: 16px; padding: 0 8px; border-radius: 999px;
  background: var(--acc); color: var(--acc-fg); font: 700 11px/16px inherit; font-family: inherit; cursor: pointer;
}
button:hover { filter: brightness(1.08); }
button:focus-visible { outline: 2px solid var(--fg); outline-offset: 1px; }
`

export const BADGE_TAG = 'bb-badge'

// Content scripts run in an isolated world where `customElements` is null, so the badge is a plain
// <bb-badge> element (a valid custom-element name, which is enough for attachShadow) driven by this class.
const badges = new WeakMap<Element, Badge>()
// One Buy menu open at a time across all badges.
let closeOpenMenu: (() => void) | null = null
export const badgeOf = (el: Element) => badges.get(el)

export class Badge {
  readonly host = document.createElement(BADGE_TAG)
  private root = this.host.attachShadow({ mode: 'closed' })

  // Resolves with the quote once load() has run (the badge reached the viewport).
  readonly ready: Promise<Quote | null>
  private start!: () => void

  constructor(readonly ref: Ref, fetchQuote: () => Promise<Quote | null>) {
    this.ready = new Promise((resolve) => { this.start = () => fetchQuote().then(resolve) })
    badges.set(this.host, this)
    this.host.dataset.kind = ref.kind
    this.root.innerHTML = `<style>${CSS}</style><span class="b" part="badge"><span class="sk"></span></span>`
    // Keep clicks inside the badge from opening the tweet underneath.
    for (const ev of ['click', 'mousedown', 'pointerdown', 'mouseup']) this.host.addEventListener(ev, (e) => e.stopPropagation())
  }

  load() { this.start() }

  setTheme(theme: 'light' | 'dark') { this.host.setAttribute('theme', theme) }

  // Dexscreener logo just before Buy, for coins whose Dexscreener profile was paid.
  private safetyReport: Safety | null | undefined
  private menuEl: HTMLElement | null = null

  markSafety(r: Safety | null) {
    this.safetyReport = r
    if (this.menuEl) fillSafety(this.menuEl, r)
    const buy = this.root.querySelector('.b > button')
    if (!r || !buy || this.root.querySelector('.rc')) return
    const s = el('span', `rc ${r.flags ? 'bad' : 'ok'}`, '')
    s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z"/></svg>'
    if (r.flags) s.append(String(r.flags))
    s.title = r.flags ? `Rug check: ${r.flags} red flag${r.flags > 1 ? 's' : ''}` : 'Rug check: no red flags'
    buy.before(s)
  }

  markDexPaid() {
    const buy = this.root.querySelector('.b > button')
    if (!buy || this.root.querySelector('.dx')) return
    const dx = el('span', 'dx', '')
    dx.title = 'DEX paid'
    dx.innerHTML = '<img alt="DEX paid" src="data:image/png;base64,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">'
    buy.before(dx)
  }

  render(q: Quote | null) {
    if (!q) { this.host.hidden = true; return }
    const b = this.root.querySelector<HTMLElement>('.b')!
    b.innerHTML = ''
    const chain = el('span', 'ch', '')
    chain.innerHTML = CHAIN_ICONS[q.chain]
    chain.title = CHAINS[q.chain].name
    // Trenchers read market cap first; the price lives in the menu. No market cap known: show the price instead.
    const mc = q.marketCapUsd != null ? el('span', 'mc', formatUsdCompact(q.marketCapUsd)) : el('span', 'mc', formatPrice(q.priceUsd))
    if (q.marketCapUsd != null) mc.prepend(el('small', '', 'MC'))
    mc.title = q.marketCapUsd != null ? 'Market cap' : 'Price'
    const change = q.change24h == null ? null : el('span', flatChange(q.change24h) ? 'flat' : q.change24h > 0 ? 'up' : 'down', formatChange(q.change24h))
    if (change) change.title = '24h change'
    const buy = el('button', '', 'Buy')
    buy.title = `Buy ${q.symbol}`
    buy.setAttribute('aria-haspopup', 'menu')
    buy.setAttribute('aria-expanded', 'false')
    const menu = buildMenu(q, this.ref.kind === 'ticker', (venue, amount) => {
      // Screen position for the checkout window: right of the Buy button, kept on screen.
      const r = buy.getBoundingClientRect()
      const chromeTop = outerHeight - innerHeight
      const left = Math.round(Math.min(screenX + r.right + 16, (screen as any).availLeft + screen.availWidth - 450))
      const top = Math.round(Math.max((screen as any).availTop ?? 0, Math.min(screenY + chromeTop + r.top - 120, (screen as any).availTop + screen.availHeight - 790)))
      close()
      this.host.dispatchEvent(new CustomEvent('bb-trade', { detail: { ...q, venue, amount, anchor: { left, top } }, bubbles: true, composed: true }))
    })
    this.menuEl = menu
    if (this.safetyReport !== undefined) fillSafety(menu, this.safetyReport)
    let openedAt = 0
    // Only a real scroll of the page closes the menu: X scrolls inner things (carousels, video) all the time.
    const onScroll = () => { if (Math.abs(scrollY - openedAt) > 10) close() }
    const close = () => {
      if (closeOpenMenu === close) closeOpenMenu = null
      menu.remove()
      menu.hidden = true
      buy.setAttribute('aria-expanded', 'false')
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', close)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', esc, true)
    }
    // The menu sits in a closed shadow root, so from the document the event path stops at the layer's host.
    const outside = (e: Event) => { const path = e.composedPath(); if (!path.includes(this.host) && !path.includes(menuLayerHost()!)) close() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); buy.focus() } }
    buy.addEventListener('click', () => {
      if (!menu.hidden) return close()
      closeOpenMenu?.()
      closeOpenMenu = close
      openedAt = scrollY
      menuLayer(this.host.getAttribute('theme') ?? 'light').root.append(menu)
      placeMenu(menu, buy)
      buy.setAttribute('aria-expanded', 'true')
      addEventListener('scroll', onScroll, { passive: true })
      addEventListener('resize', close)
      document.addEventListener('pointerdown', outside, true)
      document.addEventListener('keydown', esc, true)
      menu.querySelector<HTMLElement>('[data-a="applepay"]')!.focus()
    })
    const lines = [`${q.name} ($${q.symbol}) on ${CHAINS[q.chain].name}`, q.address, `Liquidity ${formatUsdCompact(q.liquidityUsd)}`]
    b.append(chain, mc, ...(change ? [change] : []))
    if (q.curveProgress != null) {
      const pct = Math.round(q.curveProgress * 100)
      const cv = el('span', 'cv', '')
      cv.append(Object.assign(document.createElement('i'), { style: `width:${pct}%` }))
      b.append(cv)
      lines.push(`Pons bonding curve · ${pct}% to graduation`)
    }
    b.title = lines.join('\n')
    b.append(buy)
  }
}

function el(tag: string, cls: string, text: string) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  e.textContent = text
  return e
}
