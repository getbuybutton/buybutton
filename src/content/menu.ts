import { CHAINS, CHAIN_ICONS } from '../shared/chains'
import { PUMPFUN_ICON, TERMINALS, isPumpfun, terminalFor, type TerminalId } from '../shared/terminals'
import type { Quote, Safety } from '../shared/types'
import { formatPrice, formatUsdCompact } from '../shared/format'

// Buy menu, rendered inside the badge's shadow root and positioned with `fixed`
// so X's overflow-hidden containers can't clip it.
export const MENU_CSS = `
.m {
  position: fixed; z-index: 2147483647; min-width: 212px; padding: 6px;
  border: 1px solid var(--bd); border-radius: 12px; background: var(--pop); color: var(--fg);
  box-shadow: 0 8px 28px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.08);
  font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.m[hidden] { display: none; }
.h { padding: 6px 8px 8px; display: grid; gap: 3px; }
.h b { font-size: 13px; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h span { color: var(--mut); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.h code { font: 500 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.rc { margin: 0 8px 8px; padding: 8px 10px; border-radius: 10px; background: var(--hov); }
.rc-h { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: var(--mut); letter-spacing: .06em; text-transform: uppercase; }
.rc-h b { letter-spacing: 0; text-transform: none; font-size: 11.5px; }
.rc-h b.ok { color: #00a804; } .rc-h b.bad { color: #f23645; }
.rc-g { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; margin-top: 6px; }
.rc-i { display: flex; justify-content: space-between; gap: 6px; font-size: 11.5px; color: var(--mut); }
.rc-i b { color: var(--fg); font-weight: 700; } .rc-i.bad b { color: #f23645; } .rc-i.ok b::before { content: '✓ '; color: #00a804; }
.warn { max-width: 250px; margin: 4px 0 0; padding: 6px 8px; border-radius: 8px; background: rgba(255, 170, 0, .14); color: var(--fg); font-size: 11px; font-weight: 500; line-height: 1.35; }
.i {
  all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px; border-radius: 8px; cursor: pointer; font: inherit; color: inherit;
}
.i:hover:not([aria-disabled="true"]), .i:focus-visible { background: var(--hov); outline: none; }
.i[aria-disabled="true"] { cursor: not-allowed; opacity: .5; }
.ic { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; background: var(--fg); color: var(--pop); flex: none; }
.ic svg { width: 15px; height: 15px; }
.ic img { width: 100%; height: 100%; border-radius: 7px; image-rendering: pixelated; }
.t { flex: 1; } .t small { display: block; color: var(--mut); font-size: 11px; margin-top: 2px; font-weight: 500; }
.t small .ch svg { width: 1em; height: 1em; vertical-align: -0.15em; margin-right: .3em; }
.amts { display: flex; gap: 6px; padding: 0 8px 8px 50px; }
.amt { all: unset; box-sizing: border-box; flex: 1; text-align: center; padding: 7px 0; border-radius: 8px; font: 700 12.5px/1 inherit; font-family: inherit; color: var(--acc-fg); background: var(--acc); cursor: pointer; }
.amt:hover, .amt:focus-visible { filter: brightness(1.08); outline: none; }
.row { display: flex; gap: 6px; padding: 6px 2px 2px; margin-top: 4px; border-top: 1px solid var(--bd); }
.mini { all: unset; box-sizing: border-box; flex: 1; text-align: center; padding: 7px 8px; border-radius: 8px; font: 600 12px/1 inherit; font-family: inherit; color: var(--fg); background: var(--hov); cursor: pointer; }
.mini:hover, .mini:focus-visible { background: var(--bd); outline: none; }
`

const APPLE = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.8c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.8-4.2zM14 5.2c.7-.8 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4z"/></svg>`
// The user's terminal choice, kept in sync with settings by the content script.
let preferredTerminal: TerminalId = 'axiom'
export const setPreferredTerminal = (t: TerminalId) => { preferredTerminal = t }

// Fills the menu's rug check section. textContent only: labels come from our code, values from public APIs.
export function fillSafety(m: HTMLElement, r: Safety | null) {
  const box = m.querySelector<HTMLElement>('.rc')
  if (!box) return
  if (!r) return void box.remove()
  const verdict = box.querySelector('.rc-h b')!
  verdict.textContent = r.flags ? `${r.flags} red flag${r.flags > 1 ? 's' : ''}` : 'no red flags'
  verdict.className = r.flags ? 'bad' : 'ok'
  const grid = box.querySelector('.rc-g')!
  grid.textContent = ''
  for (const i of r.items) {
    const row = document.createElement('span')
    row.className = `rc-i ${i.ok === false ? 'bad' : i.ok ? 'ok' : ''}`
    row.append(i.label, Object.assign(document.createElement('b'), { textContent: i.value }))
    grid.append(row)
  }
}

export function buildMenu(q: Quote, byTicker: boolean, onTrade: (venue: 'terminal' | 'applepay' | 'pumpfun', amount?: number) => void): HTMLElement {
  const term = TERMINALS[terminalFor(preferredTerminal, q.chain)]
  const m = document.createElement('div')
  m.className = 'm'
  m.hidden = true
  m.setAttribute('role', 'menu')
  m.innerHTML = `
    <div class="h"><b></b><span class="id"></span><span class="st"></span></div>
    <div class="rc"><div class="rc-h">Rug check <b>checking…</b></div><div class="rc-g"></div></div>
    <button class="i" role="menuitem" data-a="applepay">
      <span class="ic">${APPLE}</span><span class="t">Buy with Apple Pay<small>Card or Apple Pay, no wallet needed</small></span><span aria-hidden="true">↗</span>
    </button>
    <div class="amts">${[10, 25, 50].map((a) => `<button class="amt" data-amt="${a}" title="Buy $${a} with Apple Pay">$${a}</button>`).join('')}</div>
    <button class="i" role="menuitem" data-a="terminal">
      <span class="ic">${term.icon}</span><span class="t">Trade on ${term.name}<small><span class="ch">${CHAIN_ICONS[q.chain]}</span>${CHAINS[q.chain].name} · opens in a new tab</small></span><span aria-hidden="true">↗</span>
    </button>${isPumpfun(q.chain, q.address) ? `
    <button class="i" role="menuitem" data-a="pumpfun">
      <span class="ic">${PUMPFUN_ICON}</span><span class="t">Open on pump.fun<small>Where this coin launched</small></span><span aria-hidden="true">↗</span>
    </button>` : ''}
    <div class="row">
      <button class="mini" data-a="copy">Copy address</button>
      <a class="mini" data-a="chart" target="_blank" rel="noopener noreferrer">Chart ↗</a>
    </div>`
  // Who this is, so a ticker that matched the wrong coin is visible before buying. textContent only: names come from the API.
  const short = q.address.length > 12 ? `${q.address.slice(0, 4)}…${q.address.slice(-4)}` : q.address
  m.querySelector('.h b')!.textContent = `${q.name} · $${q.symbol}`
  const id = m.querySelector<HTMLElement>('.h .id')!
  id.append(Object.assign(document.createElement('code'), { textContent: short }), ` · ${CHAINS[q.chain].name}`)
  id.title = q.address
  m.querySelector('.h .st')!.textContent = `Price ${formatPrice(q.priceUsd)}` + (q.liquidityUsd != null ? ` · Liquidity ${formatUsdCompact(q.liquidityUsd)}` : '')
  if (byTicker) {
    const w = Object.assign(document.createElement('p'), { className: 'warn', textContent: 'Matched by ticker: several coins can share it. Check the address before buying.' })
    m.querySelector('.h')!.append(w)
  }
  m.querySelector('[data-a="terminal"]')!.addEventListener('click', () => onTrade('terminal'))
  m.querySelector('[data-a="pumpfun"]')?.addEventListener('click', () => onTrade('pumpfun'))
  m.querySelector('[data-a="applepay"]')!.addEventListener('click', () => onTrade('applepay'))
  m.querySelectorAll<HTMLElement>('[data-amt]').forEach((b) => b.addEventListener('click', () => onTrade('applepay', Number(b.dataset.amt))))
  const copy = m.querySelector<HTMLButtonElement>('[data-a="copy"]')!
  copy.title = q.address
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(q.address).catch(() => {})
    copy.textContent = 'Copied ✓'
    setTimeout(() => (copy.textContent = 'Copy address'), 1500)
  })
  // Built from the quote's own chain id and address, never from page text.
  m.querySelector<HTMLAnchorElement>('[data-a="chart"]')!.href = `https://dexscreener.com/${q.chain}/${encodeURIComponent(q.address)}`
  return m
}

// X moves its timeline with CSS transforms, and inside a transformed ancestor `position: fixed` is no longer
// relative to the viewport (the menu ended up far from its button). So menus live in their own layer,
// a shadow root attached to <html>, outside anything X renders.
const THEME_VARS = `
:host { all: initial; position: fixed; inset: 0 auto auto 0; z-index: 2147483647; }
:host { --bg: #f4f6f8; --fg: #0f1419; --mut: #536471; --bd: #dfe5ea; --acc: #00c805; --acc-fg: #04210a; --pop: #fff; --hov: #f2f4f6; }
:host([theme="dark"]) { --bg: #16181c; --fg: #e7e9ea; --mut: #8b98a5; --bd: #2f3336; --pop: #000; --hov: #16181c; }
`
let layer: { host: HTMLElement; root: ShadowRoot } | null = null
export const menuLayerHost = () => layer?.host ?? null
export function menuLayer(theme: string) {
  if (!layer || !layer.host.isConnected) {
    const host = document.createElement('bb-menu-layer')
    const root = host.attachShadow({ mode: 'closed' })
    root.innerHTML = `<style>${THEME_VARS}${MENU_CSS}</style>`
    // Clicks in the menu must not reach X's handlers either.
    for (const ev of ['click', 'mousedown', 'pointerdown', 'mouseup']) host.addEventListener(ev, (e) => e.stopPropagation())
    document.documentElement.append(host)
    layer = { host, root }
  }
  layer.host.setAttribute('theme', theme)
  return layer
}

// Opens to the right of the Buy button, top-aligned; flips left, then clamps, when the viewport is too narrow.
export function placeMenu(menu: HTMLElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect()
  menu.hidden = false
  const w = menu.offsetWidth, h = menu.offsetHeight
  const gap = 8
  let left = r.right + gap
  if (left + w > innerWidth - 8) left = r.left - gap - w
  left = Math.min(Math.max(8, left), innerWidth - w - 8)
  const top = Math.min(Math.max(8, r.top - 6), innerHeight - h - 8)
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
}
