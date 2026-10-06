// Same chains as the extension. relay = Relay chain id; axiom = Axiom ?chain= value; rpc and explorer for the wallet view
// (no explorer link for Robinhood Chain until we have one we can verify).
export const CHAINS = {
  solana: { name: 'Solana', relay: 792703809, axiom: 'sol', evm: false, rpc: 'https://api.mainnet-beta.solana.com', explorer: 'https://solscan.io/account/', logo: '/assets/chain-solana.svg' },
  ethereum: { name: 'Ethereum', relay: 1, axiom: 'eth', evm: true, rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io/address/', logo: '/assets/chain-ethereum.svg' },
  base: { name: 'Base', relay: 8453, axiom: 'base', evm: true, rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org/address/', logo: '/assets/chain-base.svg' },
  bsc: { name: 'BNB Chain', relay: 56, axiom: 'bnb', evm: true, rpc: 'https://bsc-dataseed.bnbchain.org', explorer: 'https://bscscan.com/address/', logo: '/assets/chain-bsc.svg' },
  hyperevm: { name: 'Hyperliquid', relay: 999, axiom: 'hype', evm: true, rpc: 'https://rpc.hyperliquid.xyz/evm', explorer: 'https://hyperevmscan.io/address/', logo: '/assets/chain-hyperevm.svg' },
  robinhood: { name: 'Robinhood Chain', relay: 4663, axiom: 'robinhood', evm: true, rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: '', logo: '/assets/robinhood-dark.svg' },
} as const
export type ChainId = keyof typeof CHAINS
export const isChainId = (c: unknown): c is ChainId => typeof c === 'string' && c in CHAINS
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
