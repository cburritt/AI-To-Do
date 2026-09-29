import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: `npm run dev` on :5173 proxies /api to the C# backend on :5080.
// Build: output goes into the backend's wwwroot so `dotnet run` serves the whole app.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:5080' },
  },
  build: {
    outDir: '../Api/wwwroot',
    emptyOutDir: true,
  },
})
