import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { base } from 'viem/chains'
import { App } from './App'
import './styles.css'

const appId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {appId ? (
      <PrivyProvider
        appId={appId}
        config={{
          loginMethods: ['email', 'google'],
          appearance: { accentColor: '#00C805', logo: 'https://getbuybutton.world/assets/icon.svg', landingHeader: 'Buy with Apple Pay' },
          // Every buyer gets an EVM and a Solana wallet on sign-in: no extension, no seed phrase.
          embeddedWallets: { ethereum: { createOnLogin: 'all-users' }, solana: { createOnLogin: 'all-users' }, showWalletUIs: false },
          defaultChain: base,
          supportedChains: [base],
        }}
      >
        <App />
      </PrivyProvider>
    ) : (
      <main className="buy"><div className="card"><p className="err">Missing VITE_PRIVY_APP_ID.</p></div></main>
    )}
  </StrictMode>,
)
