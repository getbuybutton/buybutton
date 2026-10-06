import type { Message, QuoteResponse } from '../shared/types'
import { quote } from './quote'
import { dexPaid } from './dexscreener'
import { safety } from './safety'
import { TtlCache } from './cache'
import { buyPageUrl, loadSettings } from '../shared/settings'
import { isPumpfun, pumpfunUrl, terminalUrl } from '../shared/terminals'
import { CHAINS, EVM_ADDRESS, SOLANA_ADDRESS, isChainId } from '../shared/chains'

// A paid profile stays paid: an hour of cache keeps us far under the orders endpoint's limit.
// Quick-buy amounts the menu offers; anything else from a page is ignored.
const AMOUNTS = [10, 25, 50]

// Holder spreads move slowly: 10 minutes keeps the free sources well within their limits.
const checks = new TtlCache<import('../shared/types').Safety | null>(10 * 60_000, 2000, 'safety')

const paid = new TtlCache<boolean>(60 * 60_000, 2000, 'dexpaid')

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse: (r: any) => void) => {
  if (msg?.type === 'safety') {
    const valid = isChainId(msg.chain) && (CHAINS[msg.chain].evm ? EVM_ADDRESS : SOLANA_ADDRESS).test(msg.address)
    if (!valid) return
    checks.get(`${msg.chain}:${msg.address}`, () => safety(msg.chain, msg.address)).then((r) => sendResponse(r), () => sendResponse(null))
    return true
  }
  if (msg?.type === 'dexpaid') {
    const valid = isChainId(msg.chain) && (CHAINS[msg.chain].evm ? EVM_ADDRESS : SOLANA_ADDRESS).test(msg.address)
    if (!valid) return
    paid.get(`${msg.chain}:${msg.address}`, () => dexPaid(msg.chain, msg.address)).then((p) => sendResponse(p), () => sendResponse(false))
    return true
  }
  if (msg?.type === 'trade') {
    // The URL is built here from the user's settings, so a page can't make the extension open anything else.
    const valid = isChainId(msg.chain) && (CHAINS[msg.chain].evm ? EVM_ADDRESS : SOLANA_ADDRESS).test(msg.address)
    if (valid)
      loadSettings().then((s) => {
        const url =
          msg.venue === 'applepay' ? buyPageUrl(s, msg.chain, msg.address, AMOUNTS.includes(msg.amount as number) ? msg.amount : undefined)
          : msg.venue === 'pumpfun' ? (isPumpfun(msg.chain, msg.address) ? pumpfunUrl(msg.address) : null)
          : terminalUrl(s, msg.chain, msg.address)
        if (!url) return
        // The checkout opens beside the post in a small window: the timeline stays where it was.
        if (msg.venue === 'applepay') {
          const a = msg.anchor
          const pos = a && Number.isFinite(a.left) && Number.isFinite(a.top) ? { left: Math.max(0, a.left), top: Math.max(0, a.top) } : {}
          chrome.windows.create({ url, type: 'popup', width: 440, height: 780, focused: true, ...pos }).catch(() => chrome.tabs.create({ url }))
        } else chrome.tabs.create({ url })
      })
    return
  }
  if (msg?.type !== 'quote') return
  quote(msg.ref)
    .catch(() => null)
    .then((q) => sendResponse({ quote: q }))
  return true
})

// First install only: show how it works. Updates stay silent.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: 'https://getbuybutton.world/welcome' })
})
