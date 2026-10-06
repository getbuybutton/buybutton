import { createPublicClient, http, parseAbi, type Address } from 'viem'

export const RPC_URL = process.env.RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'
export const FACTORY_V2: Address = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
// Block of the first V2 TokenLaunched (2026-08-03).
export const FIRST_LAUNCH_BLOCK = 26_841_846n
export const WETH: Address = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'
// viem splits a multicall into 1 KB eth_calls by default; one eth_call per multicall is ~2× faster on this RPC.
export const MULTICALL_BYTES = 256_000
const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

export const client = createPublicClient({
  chain: {
    id: 4663,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
    contracts: { multicall3: { address: MULTICALL3 } },
  },
  transport: http(RPC_URL, { retryCount: 3, timeout: 20_000 }),
})

// TokenLaunched: topic1 = token, topic2 = curve, topic3 = creator.
export const TOKEN_LAUNCHED_TOPIC = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607' as const

export const erc20Abi = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)'])
export const curveAbi = parseAbi([
  'function realQuoteReserve() view returns (uint256)',
  'function graduated() view returns (bool)',
  'function isNativeQuote() view returns (bool)',
  'function pairToken() view returns (address)',
])
