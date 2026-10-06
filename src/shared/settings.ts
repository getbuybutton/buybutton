import { CHAINS, CHAIN_IDS, isChainId, type ChainId } from './chains'

export interface Settings {
  enabled: boolean
  // Chains whose tokens get a badge.
  chains: ChainId[]
  axiomRef: string
  // Where "Trade on …" opens. GMGN falls back to Axiom on chains it doesn't cover.
  terminal: 'axiom' | 'gmgn' | 'padre'
  gmgnRef: string
  padreRef: string
  // {ca}, {chain} and {ref} are filled in; the "/@{ref}" segment is dropped when no referral code is set.
  axiomUrlTemplate: string
  // Apple Pay checkout page. The token address and chain are appended as ?ca=&chain=.
  buyPageUrl: string
}

// Format taken from Axiom's own share-link builder: /t/{token}/@{ref}?chain={chain}.
export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  chains: CHAIN_IDS,
  axiomRef: '',
  terminal: 'axiom',
  gmgnRef: '',
  padreRef: '',
  axiomUrlTemplate: 'https://axiom.trade/t/{ca}/@{ref}?chain={chain}',
  buyPageUrl: 'https://getbuybutton.world/buy',
}

// 1.0.0's default, which only knew Robinhood Chain.
const V1_TEMPLATE = 'https://axiom.trade/t/{ca}/@{ref}?chain=robinhood'

export async function loadSettings(): Promise<Settings> {
  let stored: Partial<Settings> | null = null
  try {
    stored = (await chrome.storage?.sync.get({ ...DEFAULT_SETTINGS } as Record<string, unknown>)) as Partial<Settings>
  } catch {
    // Storage unavailable (extension context invalidated): fall back to defaults.
  }
  const s = { ...DEFAULT_SETTINGS, ...stored }
  if (s.axiomUrlTemplate === V1_TEMPLATE) s.axiomUrlTemplate = DEFAULT_SETTINGS.axiomUrlTemplate
  if (!s.buyPageUrl) s.buyPageUrl = DEFAULT_SETTINGS.buyPageUrl
  if (s.terminal !== 'gmgn' && s.terminal !== 'padre') s.terminal = 'axiom'
  s.chains = Array.isArray(s.chains) ? s.chains.filter(isChainId) : CHAIN_IDS
  return s
}

export function axiomUrl(s: Settings, chain: ChainId, ca: string): string {
  const ref = s.axiomRef.trim().replace(/^@/, '')
  let url = s.axiomUrlTemplate.replace('{ca}', ca).replace('{chain}', CHAINS[chain].axiom)
  url = ref ? url.replace('{ref}', encodeURIComponent(ref)) : url.replace(/\/@\{ref\}/, '').replace(/[?&]ref=\{ref\}/, '')
  return url
}

export function buyPageUrl(s: Settings, chain: ChainId, ca: string, amount?: number): string | null {
  if (!s.buyPageUrl) return null
  try {
    const u = new URL(s.buyPageUrl)
    u.searchParams.set('ca', ca)
    u.searchParams.set('chain', chain)
    if (amount) u.searchParams.set('amount', String(amount))
    return u.toString()
  } catch {
    return null
  }
}
