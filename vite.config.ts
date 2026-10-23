import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({
      // Written into Vercel's Build Output config. vercel.json's `crons` isn't
      // read for prebuilt output, so the daily sync is declared here.
      vercel: {
        // Next to the Supabase project (ap-southeast-2): a page load makes
        // several database round trips, each one crossing the Pacific otherwise.
        functions: { regions: ['syd1'] },
        config: {
          version: 3,
          crons: [{ path: '/api/cron/sync', schedule: '0 5 * * *' }],
        },
      },
      // Security headers are set in src/start.ts: a catch-all header rule here
      // would stop Vercel routing before it reaches the server function.
      routeRules: {
        // The service worker must always be revalidated so updates roll out.
        '/sw.js': { headers: { 'Cache-Control': 'no-cache' } },
      },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
