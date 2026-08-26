import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forwards relative /api/* calls (including the SSE connection) to
      // Express in dev, so the client can use the same relative paths it
      // uses in production, where both are served from one origin.
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
