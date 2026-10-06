import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

// The local test page (http://localhost:5174) is only matched in development builds.
export default defineManifest((env) => {
  const dev = env.mode === 'development'
  const indexer = new URL(process.env.VITE_INDEXER_URL ?? 'https://buybutton-indexer.vercel.app').origin
  const pages = ['https://x.com/*', 'https://twitter.com/*', ...(dev ? ['http://localhost:5174/*'] : [])]
  return {
    manifest_version: 3,
    name: dev ? 'BUY BUTTON (dev)' : 'BUY BUTTON',
    version: pkg.version,
    description: 'Live price, market cap and a Buy button next to memecoin tickers and contract addresses on X. Solana, Base, BNB, ETH and more.',
    homepage_url: 'https://getbuybutton.world',
    permissions: ['storage'],
    host_permissions: ['https://api.dexscreener.com/*', 'https://api.rugcheck.xyz/*', 'https://api.gopluslabs.io/*', 'https://rpc.mainnet.chain.robinhood.com/*', `${indexer}/*`],
    background: { service_worker: 'src/background/index.ts', type: 'module' },
    content_scripts: [{ matches: pages, js: ['src/content/index.ts'], run_at: 'document_idle' }],
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    action: { default_popup: 'src/popup/index.html', default_title: 'BUY BUTTON', default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' } },
  }
})
