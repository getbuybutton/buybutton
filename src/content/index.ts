import { findTokens, refFromLink } from '../shared/detect'
import type { Message, Quote, QuoteResponse, Ref, Safety } from '../shared/types'
import { BADGE_TAG, Badge, badgeOf } from './badge'
import { setPreferredTerminal } from './menu'
import { loadSettings } from '../shared/settings'

// Containers where tokens get badges. Selected by data-testid only, never by X's generated classes.
const CONTAINERS = '[data-testid="tweetText"], [data-testid="UserDescription"]'
// Reset when the chosen chains change, so everything is scanned again.
let doneText = new WeakSet<Text>()
let doneLinks = new WeakSet<HTMLAnchorElement>()

function theme(): 'light' | 'dark' {
  const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g)
  if (!m) return 'light'
  const [r, g, b] = m.map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light'
}

// After the extension is reloaded or updated, the copy of this script already running in an open X tab is cut off:
// any chrome.* call throws "Extension context invalidated". That copy then shuts itself down quietly.
function alive(): boolean {
  try {
    return !!chrome.runtime?.id
  } catch {
    return false
  }
}

function shutdown() {
  observer.disconnect()
  lazy.disconnect()
  pending.clear()
}

function send<T>(msg: Message): Promise<T | null> {
  if (!alive()) {
    shutdown()
    return Promise.resolve(null)
  }
  try {
    return chrome.runtime.sendMessage<Message, T>(msg).catch(() => null)
  } catch {
    shutdown()
    return Promise.resolve(null)
  }
}

function quote(ref: Ref): Promise<Quote | null> {
  return send<QuoteResponse>({ type: 'quote', ref }).then((r) => r?.quote ?? null)
}

// Badges only fetch a price once they come near the viewport: a long timeline doesn't fire hundreds of lookups.
const lazy = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      lazy.unobserve(e.target)
      badgeOf(e.target)?.load()
    }
  },
  { rootMargin: '600px 0px' },
)

const isAddressRef = (r: Ref) => r.kind === 'ca' || r.kind === 'pair'

function makeBadge(ref: Ref, container: Element): HTMLElement {
  const b = new Badge(ref, () => quote(ref))
  b.setTheme(theme())
  b.ready.then(async (q) => {
    // Addresses win over tickers: a $TICKER for a token whose address is in the same post adds nothing.
    let shownByAddress = false
    console.log('[bb-debug] ready', ref.kind, ref.value, !!q)
    if (ref.kind === 'ticker' && q) {
      const others = [...container.querySelectorAll(BADGE_TAG)].map(badgeOf).filter((o) => o && o !== b && isAddressRef(o.ref))
      console.log('[bb-debug] others', ref.value, others.length)
      shownByAddress = (await Promise.all(others.map((o) => o!.ready))).some((o) => o?.address === q.address)
    }
    b.render(shownByAddress ? null : q)
    if (q && !shownByAddress && q.source === 'dexscreener')
      send<boolean>({ type: 'dexpaid', chain: q.chain, address: q.address }).then((paid) => paid && b.markDexPaid())
    if (q && !shownByAddress) send<Safety | null>({ type: 'safety', chain: q.chain, address: q.address }).then((r) => b.markSafety(r ?? null))
  })
  lazy.observe(b.host)
  return b.host
}

function scanContainer(container: Element) {
  // Trading and explorer links (pump.fun, Dexscreener, Axiom…): badge right after the link.
  for (const a of container.querySelectorAll('a')) {
    if (doneLinks.has(a)) continue
    doneLinks.add(a)
    const text = a.textContent ?? ''
    if (text.startsWith('$')) continue // cashtag, handled with the text below
    const ref = refFromLink(text)
    if (ref && a.nextElementSibling?.tagName.toLowerCase() !== BADGE_TAG) a.after(makeBadge(ref, container))
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    if (doneText.has(t) || t.parentElement?.closest(BADGE_TAG)) continue
    // Inside a URL link, pieces of the address sit in separate hidden spans: never read them as tokens.
    const link = t.parentElement?.closest('a')
    if (link && !(link.textContent ?? '').startsWith('$')) continue
    nodes.push(t)
  }
  for (const t of nodes) processText(t, container)
}

function processText(node: Text, container: Element) {
  doneText.add(node)
  const matches = findTokens(node.data)
  if (!matches.length) return

  // X renders cashtags as <a>$PONS</a>: put the badge after the link, not inside it.
  const link = node.parentElement?.closest('a')
  if (link && matches.length === 1 && link.textContent?.trim() === node.data.trim()) {
    if (link.nextElementSibling?.tagName.toLowerCase() !== BADGE_TAG) link.after(makeBadge(matches[0].ref, container))
    return
  }

  // Split the text node right after each match and drop a badge there. Walk backwards so indexes stay valid.
  for (const m of [...matches].reverse()) {
    const tail = node.splitText(m.index + m.length)
    doneText.add(tail)
    node.parentNode!.insertBefore(makeBadge(m.ref, container), tail)
  }
}

function scan(root: ParentNode) {
  if (root instanceof Element && root.matches(CONTAINERS)) scanContainer(root)
  root.querySelectorAll(CONTAINERS).forEach(scanContainer)
}

let pending = new Set<ParentNode>()
let scheduled = false
const observer = new MutationObserver((records) => {
  if (!alive()) return shutdown()
  for (const r of records) {
    const target = r.target instanceof Element ? r.target.closest(CONTAINERS) ?? r.target : r.target.parentElement
    if (target && !(target as Element).closest?.(BADGE_TAG)) pending.add(target as ParentNode)
  }
  if (scheduled) return
  scheduled = true
  requestIdleCallback(() => {
    const batch = pending
    pending = new Set()
    scheduled = false
    batch.forEach((n) => n.isConnected && scan(n))
  }, { timeout: 300 })
})

// Opening the tab goes through the background, which builds the Axiom / buy page URL from the user's settings.
document.addEventListener('bb-trade', (e) => {
  const q = (e as CustomEvent<Quote & { venue: 'terminal' | 'applepay' | 'pumpfun'; amount?: number; anchor?: { left: number; top: number } }>).detail
  send({ type: 'trade', venue: q.venue, chain: q.chain, address: q.address, amount: q.amount, anchor: q.anchor })
})

// Turning the extension off hides every badge and stops watching the page; turning it back on rescans.
const hideAll = Object.assign(document.createElement('style'), { textContent: `${BADGE_TAG} { display: none !important; }` })
function setEnabled(on: boolean) {
  if (on) {
    hideAll.remove()
    scan(document)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  } else {
    observer.disconnect()
    pending.clear()
    document.head.append(hideAll)
  }
}

// New chain selection: drop every badge and scan again, so the page reflects it without a reload.
function rescanAll() {
  document.querySelectorAll(BADGE_TAG).forEach((el) => el.remove())
  doneText = new WeakSet()
  doneLinks = new WeakSet()
  scan(document)
}

loadSettings().then((s) => { setPreferredTerminal(s.terminal); setEnabled(s.enabled) }).catch(() => {})
chrome.storage?.onChanged.addListener((changes, area) => {
  if (!alive()) return
  if (area !== 'sync') return
  if ('terminal' in changes) setPreferredTerminal(changes.terminal.newValue === 'gmgn' || changes.terminal.newValue === 'padre' ? changes.terminal.newValue : 'axiom')
  if ('enabled' in changes) setEnabled(changes.enabled.newValue !== false)
  else if ('chains' in changes) rescanAll()
})

// Follow X's light/dim/dark switch.
new MutationObserver(() => {
  const t = theme()
  document.querySelectorAll(BADGE_TAG).forEach((el) => badgeOf(el)?.setTheme(t))
}).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] })
