import { defineConfig } from 'vite'

// Serves the fake-tweets page at /test/ and the popup at /src/popup/, on the port the dev manifest matches.
export default defineConfig({ server: { port: 5174, strictPort: true, open: false } })
