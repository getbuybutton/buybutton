import { createPublicClient, erc20Abi, formatUnits, http } from 'viem'
import { CHAINS, type ChainId } from './chains'

// How much of `token` the buyer's wallet holds on `chain`, in whole tokens.
export async function tokenBalance(chain: ChainId, token: string, owner: string): Promise<number> {
  const c = CHAINS[chain]
  if (!c.evm) {
    const res = await fetch(c.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [owner, { mint: token }, { encoding: 'jsonParsed' }] }),
    })
    const { result, error } = await res.json()
    // An RPC error is "unknown", not "zero": never tell someone their coins are gone because a node said no.
    if (error || !result) throw new Error(error?.message ?? 'solana rpc')
    return (result?.value ?? []).reduce((sum: number, a: any) => sum + Number(a.account.data.parsed.info.tokenAmount.uiAmountString ?? 0), 0)
  }
  const client = createPublicClient({ transport: http(c.rpc) })
  const [raw, decimals] = await Promise.all([
    client.readContract({ address: token as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [owner as `0x${string}`] }),
    client.readContract({ address: token as `0x${string}`, abi: erc20Abi, functionName: 'decimals' }),
  ])
  return Number(formatUnits(raw, decimals))
}
