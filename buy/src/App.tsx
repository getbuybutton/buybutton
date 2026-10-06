import { useEffect, useMemo, useRef, useState } from 'react'
import { useDepositFunds, useExportWallet, usePrivy, useSendTransaction, useSignTypedData, useWallets } from '@privy-io/react-auth'
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem'
import { base } from 'viem/chains'
import { CHAINS, EVM_ADDRESS, SOLANA_ADDRESS, isChainId, type ChainId } from './chains'
import { ethUsd, loadToken, type TokenInfo } from './token'
import * as relay from './relay'
import { tokenBalance } from './balance'
import qrcode from 'qrcode-generator'

const baseClient = createPublicClient({ chain: base, transport: http() })
const AMOUNTS = [5, 10, 25, 50, 100, 250]
// Opened by the extension as a small checkout window beside the post (no toolbar): offer to close it when done.
const IN_POPUP = !window.toolbar?.visible
// The card checkout delivers USDC on Base (6 decimals). Below $0.50 there's nothing worth swapping.
const DUST = 500_000n
const usdcBalance = (address: string) =>
  baseClient.readContract({ address: relay.USDC_BASE, abi: erc20Abi, functionName: 'balanceOf', args: [address as `0x${string}`] })

type Step =
  | { kind: 'idle' }
  | { kind: 'paying' }
  | { kind: 'funding'; since: number }
  | { kind: 'swapping' }
  | { kind: 'done'; amount: string; usd: string }
  | { kind: 'error'; message: string }

const params = new URLSearchParams(location.search)
// ?sandbox runs the card checkout in the payment provider's test mode (test cards, no real money, no USDC delivered).
const SANDBOX = params.has('sandbox')
const chainParam = params.get('chain')
const caParam = params.get('ca') ?? ''
const chain: ChainId | null = isChainId(chainParam) ? chainParam : null
const ca = chain && (CHAINS[chain].evm ? EVM_ADDRESS : SOLANA_ADDRESS).test(caParam) ? caParam : null

// Apple Pay only exists in Safari (Mac, iPhone, iPad). On a desktop browser without it, "Buy with Apple Pay" hands the
// purchase to the buyer's iPhone: a QR code reopens this exact page there, where Apple Pay is one Face ID away.
const HAS_APPLE_PAY = (() => { try { return !!(window as any).ApplePaySession?.canMakePayments() } catch { return false } })()
const MOBILE = /iPhone|iPad|Android/i.test(navigator.userAgent)
const AMOUNT_PARAM = Number(params.get('amount'))

function qrSvg(text: string) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true })
}

const fmtUsd = (v: number | null) =>
  v == null ? '—' : '$' + Intl.NumberFormat('en-US', { notation: v >= 1e5 ? 'compact' : 'standard', maximumFractionDigits: v >= 1 ? 2 : 8 }).format(v)

export function App() {
  const { ready, authenticated, login, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const { depositFunds } = useDepositFunds()
  const { sendTransaction } = useSendTransaction()
  const { signTypedData } = useSignTypedData()
  const { exportWallet } = useExportWallet()

  const [token, setToken] = useState<TokenInfo | null | 'loading'>('loading')
  const [routable, setRoutable] = useState<boolean | null>(null)
  const [probe, setProbe] = useState<relay.Quote | null>(null)
  const [amount, setAmount] = useState(AMOUNT_PARAM > 0 ? AMOUNT_PARAM : 50)
  const [handoff, setHandoff] = useState(false)
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [usdc, setUsdc] = useState<bigint>(0n)
  const pendingBuy = useRef(false)
  const [held, setHeld] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const evmAddress = wallets.find((w) => w.walletClientType === 'privy')?.address ?? user?.wallet?.address
  const solAddress = useMemo(() => {
    const w = user?.linkedAccounts.find((a) => a.type === 'wallet' && 'chainType' in a && a.chainType === 'solana')
    return w && 'address' in w ? (w.address as string) : undefined
  }, [user])
  const recipient = chain && (CHAINS[chain].evm ? evmAddress : solAddress)

  // Token info, and whether Relay can route USDC on Base to it at all.
  useEffect(() => {
    if (!chain || !ca) return
    loadToken(chain, ca).then(setToken).catch(() => setToken(null))
    relay
      .quote({
        user: '0x000000000000000000000000000000000000dEaD',
        recipient: CHAINS[chain].evm ? '0x000000000000000000000000000000000000dEaD' : '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        chain,
        token: ca,
        amount: 25_000_000n,
      })
      .then((q) => { setProbe(q); setRoutable(true) })
      .catch(() => setRoutable(false))
  }, [])

  // The coin in the buyer's wallet, so someone coming back sees what they own.
  useEffect(() => {
    if (!chain || !ca || !recipient) return
    const read = () => tokenBalance(chain, ca, recipient).then(setHeld).catch(() => {})
    read()
    const t = setInterval(read, 10000)
    return () => clearInterval(t)
  }, [recipient, step.kind])

  // USDC already sitting in the buyer's wallet on Base (e.g. a payment whose swap didn't go through).
  useEffect(() => {
    if (!evmAddress) return
    const read = () => usdcBalance(evmAddress).then(setUsdc).catch(() => {})
    read()
    const t = setInterval(read, 5000)
    return () => clearInterval(t)
  }, [evmAddress])

  async function swapAll() {
    if (!chain || !ca || !evmAddress || !recipient) return
    setStep({ kind: 'swapping' })
    try {
      const balance = await usdcBalance(evmAddress)
      if (balance <= DUST) throw new Error('No USDC to swap yet')
      const q = await relay.quote({ user: evmAddress, recipient, chain, token: ca, amount: balance })
      for (const a of q.actions) {
        if (a.kind === 'signature') {
          // Gasless: sign a USDC transfer authorization, Relay executes and pays the gas.
          const { domain, types, primaryType, value } = a.sig.sign
          const { signature } = await signTypedData(
            { domain, types, primaryType, message: value } as Parameters<typeof signTypedData>[0],
            { address: evmAddress, uiOptions: { showWalletUIs: false } },
          )
          await relay.submitSignature(a.sig.post, signature)
        } else {
          await sendTransaction(
            { to: a.tx.to, data: a.tx.data, value: BigInt(a.tx.value), chainId: a.tx.chainId },
            { address: evmAddress, uiOptions: { showWalletUIs: false } },
          )
        }
      }
      if (q.requestId) {
        for (let i = 0; i < 90; i++) {
          const s = await relay.status(q.requestId)
          if (s === 'success') break
          if (s === 'failure' || s === 'refund') throw new Error(s === 'refund' ? 'The swap was refunded: your USDC is back in your wallet.' : 'The swap failed.')
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
      setStep({ kind: 'done', amount: Number(q.outAmount).toLocaleString('en-US', { maximumFractionDigits: 2 }), usd: q.outUsd })
    } catch (e) {
      setStep({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  async function buy() {
    if (!evmAddress || !recipient) return
    setStep({ kind: 'paying' })
    const before = await usdcBalance(evmAddress).catch(() => 0n)
    try {
      // Apple Pay / card checkout (Stripe or MoonPay through Privy), delivering USDC on Base to the buyer's wallet.
      await depositFunds({
        destination: { asset: 'usdc', chain: 'base', wallet: evmAddress },
        fiat: {
          source: { assets: ['usd', 'eur'], defaultAsset: navigator.language.startsWith('en-US') ? 'usd' : 'eur' },
          defaultAmount: String(amount),
          environment: SANDBOX ? 'sandbox' : 'production',
        },
      })
    } catch {
      setStep({ kind: 'idle' })
      return
    }
    if (SANDBOX) {
      setStep({ kind: 'error', message: 'Test payment completed. In test mode no USDC is delivered, so the swap step stops here.' })
      return
    }
    setStep({ kind: 'funding', since: Date.now() })
    // The onramp sends USDC a little after checkout: wait for it, then swap.
    for (let i = 0; i < 180; i++) {
      const now = await usdcBalance(evmAddress).catch(() => before)
      if (now > before + DUST) return swapAll()
      await new Promise((r) => setTimeout(r, 5000))
    }
    setStep({ kind: 'error', message: "Your payment went through but the USDC hasn't arrived yet. Keep this page open or come back later: you'll be able to finish the swap from here." })
  }

  // Sign-in happens in the middle of a purchase: resume once the wallets exist.
  useEffect(() => {
    if (pendingBuy.current && authenticated && evmAddress && recipient) {
      pendingBuy.current = false
      buy()
    }
  }, [authenticated, evmAddress, recipient])

  function onBuy(onThisDevice = false) {
    if (!onThisDevice && !HAS_APPLE_PAY && !MOBILE) {
      setHandoff(true)
      return
    }
    setHandoff(false)
    if (!authenticated) {
      pendingBuy.current = true
      login()
      return
    }
    buy()
  }

  if (!chain || !ca) {
    return <Shell><div className="card"><h1>Nothing to buy here</h1><p className="mut">This page opens from the BUY BUTTON extension, with a token in the link.</p></div></Shell>
  }

  const axiom = `https://axiom.trade/t/${ca}?chain=${CHAINS[chain].axiom}`
  const chart = `https://dexscreener.com/${chain}/${ca}`
  const busy = step.kind === 'paying' || step.kind === 'funding' || step.kind === 'swapping'
  // Dexscreener first; for tokens it doesn't list yet, Relay's own token data and quote-implied price.
  const t: TokenInfo | null =
    token !== 'loading' && token
      ? token
      : token === null && probe
        ? {
            name: probe.token.name,
            symbol: probe.token.symbol.replace(/^\$/, ''),
            priceUsd: Number(probe.outUsd) / Number(probe.outAmount),
            marketCapUsd: null,
            change24h: null,
            imageUrl: probe.token.logo,
          }
        : null
  const leftover = usdc > DUST && step.kind !== 'swapping' && step.kind !== 'funding' && step.kind !== 'done'

  return (
    <Shell>
      <div className="card">
        <div className="tok">
          {t?.imageUrl ? <img className="tok-img" src={t.imageUrl} alt="" /> : <div className="tok-img ph" />}
          <div className="tok-id">
            <h1>{t ? `$${t.symbol}` : token === 'loading' || routable === null ? 'Loading…' : 'Unknown token'}</h1>
            <p className="mut">
              {t?.name}
              <span className="chain"><img src={CHAINS[chain].logo} alt="" className={chain === 'robinhood' ? 'rh' : undefined} />{CHAINS[chain].name}</span>
            </p>
          </div>
          {t && (
            <div className="tok-px">
              <b>{fmtUsd(t.priceUsd)}</b>
              {t.change24h != null && <span className={t.change24h >= 0 ? 'up' : 'down'}>{t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(1)}%</span>}
              <small className="mut">MC {fmtUsd(t.marketCapUsd)}</small>
            </div>
          )}
        </div>

        {routable === false ? (
          <div className="note">
            <p>This token can't be bought by card yet (it's probably still on its launch curve, or has no liquidity).</p>
            <a className="btn" href={axiom} target="_blank" rel="noopener">Trade on Axiom ↗</a>
          </div>
        ) : step.kind === 'done' ? (
          <div className="done">
            <div className="check">✓</div>
            <h2>You bought {step.amount} ${t?.symbol}</h2>
            <p className="mut">≈ ${Number(step.usd).toFixed(2)}, in your wallet on {CHAINS[chain].name}.</p>
            <div className="row">
              <a className="btn btn-ghost" href={chart} target="_blank" rel="noopener">Chart ↗</a>
              <button className="btn btn-ghost" onClick={() => exportWallet()}>Export wallet to sell</button>
            </div>
            <p className="fine mut">Your coins sit in this wallet. To sell, export it into Phantom, MetaMask or Rabby, or come back here anytime to see your balance.</p>
            <button className="link" onClick={() => setStep({ kind: 'idle' })}>Buy more</button>
            {IN_POPUP && <button className="btn" onClick={() => window.close()}>Back to X</button>}
          </div>
        ) : (
          <>
            <div className="amounts" role="radiogroup" aria-label="Amount">
              {AMOUNTS.map((a) => (
                <button key={a} role="radio" aria-checked={amount === a} className={amount === a ? 'on' : ''} disabled={busy} onClick={() => setAmount(a)}>
                  ${a}
                </button>
              ))}
            </div>
            {t && <p className="est mut">≈ {Math.floor(amount / t.priceUsd).toLocaleString('en-US')} ${t.symbol} before fees</p>}
            {chain === 'ethereum' && <p className="warn">Ethereum network fees are high: small buys lose a big share to fees. Prefer $100 or more.</p>}
            {probe && probe.impactPct < -5 && chain !== 'ethereum' && (
              <p className="warn">Thin liquidity: a ${amount} buy moves the price by about {Math.abs(probe.impactPct * (amount / Math.max(1, Number(probe.inUsd)))).toFixed(0)}% or more.</p>
            )}
            <button className="pay" disabled={!ready || busy || routable !== true} onClick={() => onBuy()}>
              {step.kind === 'paying' ? 'Waiting for payment…'
                : step.kind === 'funding' ? 'Payment received, getting your funds…'
                : step.kind === 'swapping' ? `Buying $${t?.symbol ?? ''}…`
                : <>Buy with <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.8c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.8-4.2zM14 5.2c.7-.8 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4z"/></svg>Pay</>}
            </button>
            {handoff && (
              <div className="handoff">
                <div className="qr" dangerouslySetInnerHTML={{ __html: qrSvg(`${location.origin}/buy?ca=${ca}&chain=${chain}&amount=${amount}`) }} />
                <div>
                  <b>Scan with your iPhone</b>
                  <p className="mut">This browser can't show Apple Pay. Point your iPhone camera at the code: the same ${amount} buy opens in Safari, ready for Face ID.</p>
                  <button className="link" onClick={() => onBuy(true)}>Or pay by card on this computer</button>
                </div>
              </div>
            )}
            <p className="fine mut">Card or Apple Pay. Sign in with your email or Google: a wallet is created for you, nothing to install.</p>
            {step.kind === 'error' && <p className="err">{step.message}</p>}
            {leftover && (
              <div className="note">
                <p>You have ${Number(formatUnits(usdc, 6)).toFixed(2)} of USDC waiting in your wallet.</p>
                <button className="btn" onClick={swapAll}>Swap it to ${t?.symbol}</button>
              </div>
            )}
          </>
        )}

        {SANDBOX && <p className="warn">Test mode: use a test card (4242 4242 4242 4242). No real money is charged.</p>}
        {authenticated && (
          <div className="wallet">
            <div className="wallet-h">Your wallet</div>
            {recipient && (
              <div className="wallet-row">
                <code title={recipient}>{recipient.slice(0, 6)}…{recipient.slice(-4)}</code>
                <button className="link" onClick={() => { navigator.clipboard.writeText(recipient).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? 'Copied ✓' : 'Copy'}</button>
                {chain && CHAINS[chain].explorer && <a className="link" href={CHAINS[chain].explorer + recipient} target="_blank" rel="noopener">View ↗</a>}
              </div>
            )}
            {t && held != null && (
              <div className="wallet-row">
                <span>{held.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.symbol}</span>
                <span className="mut">≈ {fmtUsd(held * t.priceUsd)}</span>
              </div>
            )}
            <div className="acct mut">
              <span>Signed in{user?.email?.address ? ` as ${user.email.address}` : ''}</span>
              <button className="link" onClick={() => exportWallet()}>Export wallet</button>
              <button className="link" onClick={() => logout()}>Sign out</button>
            </div>
          </div>
        )}
      </div>
      <p className="legal mut">
        Payments are processed by our card partners (Stripe or MoonPay) and swaps by Relay. Your tokens go to a wallet that only you control. Memecoins are risky: only buy what you can afford to lose.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="nav">
        <a className="brand" href="/"><img src="/assets/icon.svg" alt="" width="28" height="28" /><span>BUY BUTTON</span></a>
      </header>
      <main className="buy">{children}</main>
    </>
  )
}
