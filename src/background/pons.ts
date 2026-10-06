import {
  BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError, createPublicClient, http, parseAbi, type Address,
} from 'viem'

export const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'
export const CHAIN_ID = 4663
export const WETH: Address = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'
const FACTORY_V2: Address = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
export const PONS_SUPPLY = 1_000_000_000

// Batched JSON-RPC: the reads for one token go out as a single HTTP request.
const client = createPublicClient({ transport: http(RPC_URL, { batch: { wait: 20 } }) })

// Reconstructed from the deployed bytecode (the explorer is behind a bot check).
// getLaunchedToken returns a struct whose first two words are (token, curve); we only read those.
const factoryAbi = parseAbi(['function getLaunchedToken(address) view returns (address token, address curve)'])
const curveAbi = parseAbi([
  'function getReserves() view returns (uint256 quote, uint256 token)',
  'function realQuoteReserve() view returns (uint256)',
  'function graduationThreshold() view returns (uint256)',
  'function graduated() view returns (bool)',
  'function isNativeQuote() view returns (bool)',
  'function pairToken() view returns (address)',
])
const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
])

export interface CurveState {
  symbol: string
  name: string
  quoteToken: Address // WETH when the curve is priced in native ETH
  quoteDecimals: number
  priceInQuote: number // quote per whole token
  realQuote: number // quote actually deposited, in whole units
  progress: number
}

// Live state of a Pons V2 bonding curve, or null if the token is not a V2 launch still on its curve.
export async function readCurve(token: Address): Promise<CurveState | null> {
  const launched = await client
    .readContract({ address: FACTORY_V2, abi: factoryAbi, functionName: 'getLaunchedToken', args: [token] })
    .catch((e: BaseError) => {
      // A revert or empty return means "not a V2 launch"; anything else (network, RPC) propagates.
      if (e.walk?.((c) => c instanceof ContractFunctionRevertedError || c instanceof ContractFunctionZeroDataError)) return null
      throw e
    })
  if (!launched || launched[0].toLowerCase() !== token.toLowerCase()) return null
  const curve = launched[1]
  const read = <F extends (typeof curveAbi)[number]['name']>(functionName: F) =>
    client.readContract({ address: curve, abi: curveAbi, functionName } as any) as Promise<any>

  const [graduated, [q, t], real, threshold, native, symbol, name, tokenDecimals] = await Promise.all([
    read('graduated'), read('getReserves'), read('realQuoteReserve'), read('graduationThreshold'), read('isNativeQuote'),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ])
  // After graduation the curve is frozen; the live price is on the DEX pool, not here.
  if (graduated || t === 0n) return null

  const quoteToken: Address = native ? WETH : await read('pairToken')
  const quoteDecimals = native ? 18 : await client.readContract({ address: quoteToken, abi: erc20Abi, functionName: 'decimals' })
  const qf = 10 ** quoteDecimals
  return {
    symbol, name, quoteToken, quoteDecimals,
    priceInQuote: (Number(q) / qf) / (Number(t) / 10 ** tokenDecimals),
    realQuote: Number(real) / qf,
    progress: Math.min(1, Number(real) / Number(threshold)),
  }
}
