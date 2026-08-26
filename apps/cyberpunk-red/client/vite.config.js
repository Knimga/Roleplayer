import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Fixed at 5174 (laria5e's client stays on Vite's default 5173) so both
    // apps' dev servers can run side by side without one silently drifting
    // to a random free port.
    port: 5174,
    strictPort: true,
    proxy: {
      // Forwards relative /api/* calls (including the SSE connection) to
      // Express in dev, so the client can use the same relative paths it
      // uses in production, where both are served from one origin.
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
})
