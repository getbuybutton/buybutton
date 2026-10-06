// Chains BUY BUTTON prices and links to. Keys are Dexscreener chain ids; `axiom` is Axiom's ?chain= value
// (both checked against their live APIs/front-end).
export const CHAINS = {
  solana: { name: 'Solana', axiom: 'sol', evm: false },
  ethereum: { name: 'Ethereum', axiom: 'eth', evm: true },
  base: { name: 'Base', axiom: 'base', evm: true },
  bsc: { name: 'BNB Chain', axiom: 'bnb', evm: true },
  hyperevm: { name: 'Hyperliquid', axiom: 'hype', evm: true },
  robinhood: { name: 'Robinhood Chain', axiom: 'robinhood', evm: true },
} as const

export type ChainId = keyof typeof CHAINS
export const CHAIN_IDS = Object.keys(CHAINS) as ChainId[]
export const isChainId = (c: unknown): c is ChainId => typeof c === 'string' && c in CHAINS

export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

// EVM addresses compare case-insensitively; Solana's base58 is case-sensitive.
export const normalizeAddress = (a: string) => (a.startsWith('0x') ? a.toLowerCase() : a)

// Small marks shown in front of the chain name (badge, menu, popup).
export const CHAIN_ICONS: Record<ChainId, string> = {
  solana: `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="bb-sol" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="#000"/><path fill="url(#bb-sol)" d="M7.2 15.4h11.1l-1.6 1.8H5.6zm0-4.3h11.1l-1.6-1.8H5.6zm1.5-4.3h11.1L18.2 8.6H7.1z"/></svg>`,
  ethereum: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="12" fill="#627EEA"/><path fill="#fff" d="M12 4v6l5 2.2zm0 0L7 12.2 12 10zm0 12.2v3.8l5-6.9zm0 3.8v-3.8L7 13.1zm0-4.7 5-2.9-5-2.2zm-5-2.9 5 2.9V10z" opacity=".9"/></svg>`,
  base: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#0052FF"/></svg>`,
  bsc: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="12" fill="#F0B90B"/><path fill="#fff" d="m12 5.5 2 2-2 2-2-2zm-4 4 2 2-2 2-2-2zm8 0 2 2-2 2-2-2zm-4 4 2 2-2 2-2-2z"/></svg>`,
  hyperevm: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="12" fill="#072723"/><path fill="#97FCE4" d="M5 12c0-2.6 1.4-4.5 3.3-4.5 2.6 0 3 3.2 4.7 3.2S15 7.5 17.4 7.5C18.9 7.5 19 10 19 12s-.1 4.5-1.6 4.5c-2.4 0-2.7-3.2-4.4-3.2s-2.1 3.2-4.7 3.2C6.4 16.5 5 14.6 5 12z"/></svg>`,
  robinhood: `<svg viewBox="0 0 115.87 149.53" aria-hidden="true" fill="currentColor"><path d="m.86,149.53h3.3c.6,0,1.2-.3,1.4-.8C30.46,85.33,57.56,53.93,74.56,35.13c.7-.8.4-1.4-.6-1.4h-30.4c-1.1,0-2.03.44-2.8,1.4l-21.8,27c-3.2,4-4,7.7-4,13v27.6C7.86,122.63,3.36,136.13.06,148.33c-.2.78.1,1.2.8,1.2ZM110.56,4.03c-4.7-5-25.9-5.2-35.7-1.4-2.04.79-4,2.13-4.9,2.9-9,7.7-15,13.8-20.7,19.8-.7.7-.4,1.4.6,1.4h33.7c3.1,0,4.9,1.8,4.9,4.9v38c0,1,.8,1.3,1.4.4l20.3-26.5c3.3-4.3,4.3-5.6,5.2-11.6,1.2-8.8.5-22.3-4.8-27.9Zm-43.5,100.8l13.9-22.9c.3-.6.4-1.3.4-1.8v-38.2c0-1-.7-1.4-1.4-.6-20.9,23.3-37.2,47.8-52.3,77.3-.38.74.1,1.4,1,1.1l31.2-9.6c3.52-1.08,5.5-2.5,7.2-5.3Z"/></svg>`,
}
