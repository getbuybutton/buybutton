import { createPublicClient, erc20Abi, http } from 'viem'
import type { ChainId } from '../shared/chains'
import type { Safety, SafetyItem } from '../shared/types'
import { rateLimit } from './limiter'
import { PONS_SUPPLY, RPC_URL, readCurve } from './pons'

// Rug check: the red flags a trencher looks for before buying, from public sources.
// Solana: RugCheck. Ethereum, Base, BNB: GoPlus. Robinhood Chain: the Pons curve and launch event read on-chain.
// Every item says what it measured; nothing is shown when a source has no data (never a guess dressed as a check).
// Red (ok = false) only for unambiguous signals: honeypot, sell tax > 10%, mint/freeze still active, dev > 5%, top 10 > 50%.
// Context-dependent ones (unlocked LP on a big coin, insider graphs) are shown without a flag.
const rugLimited = rateLimit(30)
const goLimited = rateLimit(30)
const GOPLUS_CHAIN: Partial<Record<ChainId, string>> = { ethereum: '1', base: '8453', bsc: '56', robinhood: '4663' }

const pct = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10) + '%'
const item = (label: string, value: string, ok: boolean | null): SafetyItem => ({ label, value, ok })
const report = (items: SafetyItem[]): Safety => ({ items, flags: items.filter((i) => i.ok === false).length })

async function solana(mint: string): Promise<Safety | null> {
  const res = await rugLimited(() => fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`))
  if (!res.ok) throw new Error(`rugcheck ${res.status}`)
  const d = await res.json()
  const items: SafetyItem[] = []
  if (d.rugged) items.push(item('status', 'rugged', false))
  // Top holders, minus pools and launchpad curves (they hold supply for everyone, not for one person).
  const known = d.knownAccounts ?? {}
  // A single wallet with 90%+ of supply is a launchpad curve or vault the source doesn't label, not a person.
  const holders = (d.topHolders ?? []).filter((h: any) => !known[h.owner] && !known[h.address] && (h.pct ?? 0) < 90).slice(0, 10)
  if (holders.length) {
    const top = holders.reduce((s: number, h: any) => s + (h.pct ?? 0), 0)
    if (top > 0) items.push(item('top 10 holders', pct(top), top <= 50))
  }
  const supply = Number(d.token?.supply ?? 0)
  if (d.creator && supply > 0) {
    const dev = (Number(d.creatorBalance ?? 0) / supply) * 100
    items.push(item('dev wallet', dev < 0.01 ? '0%' : pct(dev), dev < 5))
  }
  items.push(item('mint authority', d.mintAuthority ? 'active' : 'renounced', !d.mintAuthority))
  if (d.freezeAuthority) items.push(item('freeze authority', 'active', false))
  if (typeof d.graphInsidersDetected === 'number') items.push(item('insider wallets', d.graphInsidersDetected ? String(d.graphInsidersDetected) : 'none', d.graphInsidersDetected === 0 ? true : null))
  const lp = (d.markets ?? []).map((m: any) => m.lp?.lpLockedPct).filter((x: any) => typeof x === 'number')
  if (lp.length) { const locked = Math.max(...lp); items.push(item('liquidity locked', pct(locked), locked >= 90 ? true : null)) }
  return items.length ? report(items) : null
}

async function goplus(chain: ChainId, address: string): Promise<SafetyItem[]> {
  const id = GOPLUS_CHAIN[chain]
  if (!id) return []
  const res = await goLimited(() => fetch(`https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${address}`))
  if (!res.ok) throw new Error(`goplus ${res.status}`)
  const r = Object.values((await res.json()).result ?? {})[0] as any
  if (!r) return []
  const items: SafetyItem[] = []
  if (r.is_honeypot === '1') items.push(item('honeypot', "can't sell", false))
  else if (r.is_honeypot === '0') items.push(item('honeypot', 'no', true))
  const sell = Number(r.sell_tax)
  if (r.sell_tax !== '' && Number.isFinite(sell)) items.push(item('sell tax', pct(sell * 100), sell <= 0.1))
  const holders = (r.holders ?? []).filter((h: any) => h.is_contract !== 1 && h.is_contract !== '1' && Number(h.percent) < 0.9).slice(0, 10)
  if (holders.length) { const top = holders.reduce((s: number, h: any) => s + Number(h.percent) * 100, 0); if (top > 0) items.push(item('top 10 holders', pct(top), top <= 50)) }
  if (r.creator_percent !== undefined && r.creator_address && r.holders?.length) {
    const dev = Number(r.creator_percent) * 100
    items.push(item('dev wallet', dev < 0.01 ? '0%' : pct(dev), dev < 5))
  }
  if (r.is_mintable === '1') items.push(item('mintable', 'yes', false))
  if (r.lp_holders?.length) {
    const locked = r.lp_holders.filter((h: any) => h.is_locked === 1 || h.is_locked === '1').reduce((s: number, h: any) => s + Number(h.percent) * 100, 0)
    items.push(item('liquidity locked', pct(locked), locked >= 90 ? true : null))
  }
  return items
}

// Pons launches: the creator comes from the TokenLaunched event, searched backwards in 10M-block slices (RPC limit).
const FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as const
const FIRST_LAUNCH_BLOCK = 26_841_846n
const TOKEN_LAUNCHED_TOPIC = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607'
const client = createPublicClient({ transport: http(RPC_URL) })
const pad = (a: string) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0')

async function ponsCreator(token: `0x${string}`): Promise<`0x${string}` | null> {
  let to = await client.getBlockNumber()
  while (to > FIRST_LAUNCH_BLOCK) {
    const from = to - 9_999_999n > FIRST_LAUNCH_BLOCK ? to - 9_999_999n : FIRST_LAUNCH_BLOCK
    const logs = (await client.request({
      method: 'eth_getLogs',
      params: [{ address: FACTORY, topics: [TOKEN_LAUNCHED_TOPIC, pad(token)], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
    } as any)) as { topics: string[] }[]
    // topic1 = token, topic2 = curve, topic3 = creator.
    if (logs.length && logs[0].topics[3]) return `0x${logs[0].topics[3].slice(26)}` as `0x${string}`
    to = from - 1n
  }
  return null
}

async function robinhood(address: string): Promise<SafetyItem[]> {
  const token = address as `0x${string}`
  const curve = await readCurve(token).catch(() => null)
  if (!curve) return []
  const items: SafetyItem[] = [item('liquidity', 'pons curve, no LP to pull', true)]
  const creator = await ponsCreator(token).catch(() => null)
  if (creator) {
    const bal = await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [creator] })
    const dev = (Number(bal) / 1e18 / PONS_SUPPLY) * 100
    items.push(item('dev wallet', dev < 0.01 ? '0%' : pct(dev), dev < 5))
  }
  return items
}

export async function safety(chain: ChainId, address: string): Promise<Safety | null> {
  if (chain === 'solana') return solana(address)
  const items = chain === 'robinhood' ? [...(await robinhood(address)), ...(await goplus(chain, address).catch(() => []))] : await goplus(chain, address)
  // One line per label: the on-chain read wins over a second source.
  const seen = new Set<string>()
  const unique = items.filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true)))
  return unique.length ? report(unique) : null
}
