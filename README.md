# BUY BUTTON

A buy button on every coin on X.

BUY BUTTON is a Chrome extension. Every `$TICKER`, contract address, pump.fun or Dexscreener link on your X timeline gets a small badge right next to it: chain, market cap, 24h change, DEX paid, a rug check, and a **Buy** button. One click opens the coin on your terminal (Axiom, GMGN or Padre), or buys it with Apple Pay / card with no wallet needed.

Website: [getbuybutton.world](https://getbuybutton.world) · X: [@getbuybutton](https://x.com/getbuybutton)

## What's in this repo

| Folder | What it is |
|---|---|
| `src/` | The extension (Manifest V3, TypeScript): content script, background worker, popup |
| `buy/` | The buy page (React): email/Google sign-in, card or Apple Pay checkout, swap to the coin |
| `indexer/` | A small Vercel service that indexes Pons V2 launches on Robinhood Chain, so tickers still on their bonding curve resolve |
| `test/` | A fake X timeline to run the content script with mock or live data |

## Security model

The code is public so you can verify these yourself:

- **The extension never touches keys or wallets.** It has no wallet code, signs nothing and asks for no seed phrase. It only reads public prices and opens links.
- **Minimal permissions.** `storage` for your settings, and host access to the public APIs it reads: Dexscreener, RugCheck, GoPlus, the Robinhood Chain RPC and our indexer. No access to your browsing history, no tabs permission.
- **What leaves your browser:** only the ticker or contract address the extension found, sent to those APIs to look up a price or a rug check. No analytics, no tracking, no account.
- **Links are built by the extension, not by the page.** A post can't make the extension open an arbitrary URL: the background worker validates the chain and address, then builds the terminal or buy page URL itself.
- **The buy page** (`buy/`) creates a self-custodial embedded wallet through Privy when you sign in. Card and Apple Pay payments go through Stripe or MoonPay and deliver USDC on Base; the swap to the coin goes through Relay with a gasless permit you sign. Only you control that wallet, and you can export it at any time.

## How a badge is decided

- **Contract addresses** win over tickers. The extension picks the deepest pair whose price agrees with the median of the token's pairs, so one broken pool can't set the price.
- **Tickers** are matched across the chains you enabled. Pools that don't actually trade (fake liquidity, one transaction) are ignored, and a minimum liquidity is required. When a coin was only matched by its ticker, the menu tells you to check the address before buying.
- **Rug check:** RugCheck on Solana, GoPlus on Ethereum, Base and BNB Chain, and on-chain reads for Pons launches on Robinhood Chain. Red only for unambiguous signals (honeypot, sell tax above 10%, active mint or freeze authority, dev wallet above 5%, top 10 holders above 50%).

## Build

```bash
npm install
npm run build        # extension → dist/ (load it unpacked in chrome://extensions)
npm run dev          # rebuilds the extension on every change
npm run test:page    # fake X timeline at /test/index.html?harness (mock) or ?harness=live
```

Buy page: `cd buy && cp .env.example .env && npm install && npm run build`.
Indexer: `cd indexer && npm install`, deployed on Vercel with an Upstash Redis store.

## License

Source-available: you can read, run and audit this code, but not reuse it. See [LICENSE](LICENSE).

BUY BUTTON is an independent project, not affiliated with X, Apple, Axiom, GMGN, Padre, pump.fun, Dexscreener, Pons, Robinhood or any chain shown. Memecoins are risky: only buy what you can afford to lose.
