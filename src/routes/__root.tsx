import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { ErrorComponentProps } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { MobileNav } from '#/components/mobile-nav'
import { SiteHeader } from '#/components/site-header'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import { Toaster } from '#/components/ui/sonner'
import { TooltipProvider } from '#/components/ui/tooltip'
import { viewerQuery } from '#/lib/queries'
import { colorSchemeScript } from '#/lib/theme'

import appCss from '../styles.css?url'

interface MyRouterContext {
  queryClient: QueryClient
}

const DESCRIPTION =
  'Stats on your Discogs record collection, and help picking what to play next.'

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ context }) => {
    const viewer = await context.queryClient.ensureQueryData(viewerQuery)
    return { viewer }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      // viewport-fit=cover lets the installed app use the full screen on
      // notched phones; safe-area insets keep content clear of the notch.
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Spinsight' },
      { name: 'description', content: DESCRIPTION },
      { name: 'application-name', content: 'Spinsight' },
      // Kept in sync with the light/dark toggle by applyColorScheme().
      { name: 'theme-color', content: '#f3ebdd' },
      // iOS home-screen app.
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Spinsight' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      // Link previews.
      { property: 'og:site_name', content: 'Spinsight' },
      { property: 'og:title', content: 'Spinsight' },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:image', content: '/icon-512.png' },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RootError,
})

function useServiceWorker() {
  useEffect(() => {
    // Production only: in dev a worker would serve stale modules.
    if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch((e: unknown) => {
      console.warn('Service worker registration failed', e)
    })
  }, [])
}

function RootDocument({ children }: { children: React.ReactNode }) {
  useServiceWorker()
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorSchemeScript }} />
        <HeadContent />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <TooltipProvider>
          <SiteHeader />
          {/* Bottom padding on phones clears the tab bar (and the home indicator). */}
          <div
            id="main"
            className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0"
          >
            {children}
          </div>
          <MobileNav />
          <Toaster
            position="bottom-center"
            offset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
          />
        </TooltipProvider>
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="page-wrap flex flex-col items-center py-24 text-center">
      <VinylDisc look={null} className="w-32 opacity-80" />
      <h1 className="mt-8 text-4xl font-bold">Skipped a groove</h1>
      <p className="mt-2 text-muted-foreground">
        There's nothing at this address.
      </p>
      <Button
        asChild
        className="mt-6 bg-record-1 text-record-ink hover:bg-record-1/90"
      >
        <Link to="/">Back to the shop</Link>
      </Button>
    </main>
  )
}

function RootError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="page-wrap flex flex-col items-center py-24 text-center">
      <VinylDisc look={null} className="w-32 opacity-80" />
      <h1 className="mt-8 text-4xl font-bold">The needle jumped</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Something went wrong loading this page.
      </p>
      <p className="mt-3 max-w-md font-mono text-xs text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <div className="mt-6 flex gap-2">
        <Button
          onClick={reset}
          className="bg-record-1 text-record-ink hover:bg-record-1/90"
        >
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Home</Link>
        </Button>
      </div>
    </main>
  )
}
