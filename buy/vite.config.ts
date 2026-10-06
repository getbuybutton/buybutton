import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, extname } from 'node:path'

// In dev, serve the static site's shared /assets (styles, logos) next to the buy page.
const siteAssets = (): Plugin => ({
  name: 'site-assets',
  configureServer(server) {
    // Vite's dev server prefixes the link with the /buy/ base; the production build leaves /assets alone.
    for (const mount of ['/assets', '/buy/assets']) server.middlewares.use(mount, (req, res, next) => {
      const file = resolve(__dirname, '../site/assets', '.' + (req.url ?? '').split('?')[0])
      if (!file.startsWith(resolve(__dirname, '../site/assets')) || !existsSync(file)) return next()
      res.setHeader('content-type', { '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[extname(file)] ?? 'application/octet-stream')
      res.end(readFileSync(file))
    })
  },
})

// Built into the static site, served at https://getbuybutton.world/buy
export default defineConfig({
  base: '/buy/',
  plugins: [react(), siteAssets()],
  build: { outDir: '../site/buy', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { port: 5177, strictPort: true },
})
