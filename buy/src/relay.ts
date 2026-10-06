import { CHAINS, type ChainId } from './chains'

// Relay (relay.link): from USDC on Base to the token on its own chain (bridge + swap). With `usePermit`, the buyer only
// signs a USDC transfer authorization (EIP-3009) and Relay's solver pays the gas: the buyer never needs ETH.
const API = 'https://api.relay.link'
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// Optional revenue: a share of every purchase, sent by Relay to this address.
const FEE_RECIPIENT = import.meta.env.VITE_APP_FEE_RECIPIENT as string | undefined
const FEE_BPS = Number(import.meta.env.VITE_APP_FEE_BPS ?? 0)

export interface RelayTx { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number }
export interface RelaySignature {
  sign: { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; value: Record<string, unknown> }
  post: { endpoint: string; method: string; body: Record<string, unknown> }
}
export type Action = { kind: 'transaction'; tx: RelayTx } | { kind: 'signature'; sig: RelaySignature }

export interface Quote {
  requestId: string | null
  actions: Action[]
  outAmount: string
  outUsd: string
  inUsd: string
  // What Relay knows about the token: used when Dexscreener doesn't list it yet (fresh launches).
  token: { symbol: string; name: string; logo: string | null }
  impactPct: number
}

export async function quote(opts: { user: string; recipient: string; chain: ChainId; token: string; amount: bigint }): Promise<Quote> {
  const body: Record<string, unknown> = {
    user: opts.user,
    recipient: opts.recipient,
    originChainId: 8453,
    originCurrency: USDC_BASE,
    destinationChainId: CHAINS[opts.chain].relay,
    destinationCurrency: opts.token,
    tradeType: 'EXACT_INPUT',
    amount: opts.amount.toString(),
    usePermit: true,
  }
  if (FEE_RECIPIENT && FEE_BPS > 0) body.appFees = [{ recipient: FEE_RECIPIENT, fee: String(FEE_BPS) }]
  const res = await fetch(`${API}/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok || !data.steps) throw new Error(data.message ?? 'No route for this token')
  const actions: Action[] = []
  let requestId: string | null = null
  for (const step of data.steps) {
    requestId ??= step.requestId ?? null
    for (const item of step.items) {
      if (step.kind === 'transaction') actions.push({ kind: 'transaction', tx: { ...item.data, chainId: item.data.chainId ?? 8453 } })
      else if (step.kind === 'signature') actions.push({ kind: 'signature', sig: item.data })
      else throw new Error('Unsupported route')
    }
  }
  return {
    requestId,
    actions,
    outAmount: data.details.currencyOut.amountFormatted,
    outUsd: data.details.currencyOut.amountUsd,
    inUsd: data.details.currencyIn.amountUsd,
    token: {
      symbol: data.details.currencyOut.currency.symbol,
      name: data.details.currencyOut.currency.name,
      logo: data.details.currencyOut.currency.metadata?.logoURI ?? null,
    },
    impactPct: Number(data.details.totalImpact?.percent ?? 0),
  }
}

// Hands a signed authorization to Relay, which then executes the purchase.
export async function submitSignature(post: RelaySignature['post'], signature: string): Promise<void> {
  const res = await fetch(`${API}${post.endpoint}?signature=${signature}`, {
    method: post.method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(post.body),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `Relay ${res.status}`)
}

export type Status = 'pending' | 'success' | 'failure' | 'refund'
export async function status(requestId: string): Promise<Status> {
  const res = await fetch(`${API}/intents/status/v2?requestId=${requestId}`)
  const data = await res.json()
  const s = String(data.status ?? 'pending')
  if (s === 'success') return 'success'
  if (s === 'failure') return 'failure'
  if (s === 'refund') return 'refund'
  return 'pending'
}
