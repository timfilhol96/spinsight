import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { LogOut, Moon, Sun, SunMoon, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { viewerQuery } from '#/lib/queries'
import { useColorScheme } from '#/lib/theme'
import type { ColorScheme } from '#/lib/theme'

const NEXT_SCHEME: Record<ColorScheme, ColorScheme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

function SchemeToggle() {
  const { scheme, setScheme } = useColorScheme()
  const Icon = scheme === 'light' ? Sun : scheme === 'dark' ? Moon : SunMoon
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setScheme(NEXT_SCHEME[scheme])}
      aria-label={`Colour scheme: ${scheme}. Switch to ${NEXT_SCHEME[scheme]}.`}
      title={`Theme: ${scheme}`}
    >
      <Icon />
    </Button>
  )
}

export function SiteHeader() {
  const { data: viewer } = useQuery(viewerQuery)

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="page-wrap flex h-16 items-center gap-6">
        <Link
          to="/"
          className="group flex items-center gap-2 text-foreground no-underline"
        >
          <img
            src="/logo.svg"
            alt=""
            className="size-7 transition-transform duration-700 group-hover:rotate-180"
          />
          <span className="font-display text-xl font-bold tracking-tight">
            Spinsight
          </span>
        </Link>

        {viewer && (
          <nav className="hidden items-center gap-5 text-sm font-medium sm:flex">
            <Link
              to="/u/$username"
              params={{ username: viewer.username }}
              activeOptions={{ exact: true, includeSearch: false }}
              className="text-muted-foreground hover:text-foreground"
              activeProps={{
                className:
                  'text-foreground underline decoration-record-1 decoration-2 underline-offset-8',
              }}
            >
              Collection
            </Link>
            <Link
              to="/u/$username/insights"
              params={{ username: viewer.username }}
              className="text-muted-foreground hover:text-foreground"
              activeProps={{
                className:
                  'text-foreground underline decoration-record-1 decoration-2 underline-offset-8',
              }}
            >
              Insights
            </Link>
            <Link
              to="/u/$username/pick"
              params={{ username: viewer.username }}
              className="text-muted-foreground hover:text-foreground"
              activeProps={{
                className:
                  'text-foreground underline decoration-record-1 decoration-2 underline-offset-8',
              }}
            >
              Pick a record
            </Link>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1">
          <SchemeToggle />
          {viewer ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Account menu"
                >
                  <Avatar className="size-8">
                    <AvatarImage src={viewer.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback>
                      {viewer.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-semibold">
                    {viewer.displayName || viewer.username}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    @{viewer.username}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    to="/u/$username"
                    params={{ username: viewer.username }}
                  >
                    <User /> My collection
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <form
                    method="post"
                    action="/api/auth/logout"
                    className="w-full"
                  >
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2"
                    >
                      <LogOut className="size-4 text-muted-foreground" /> Sign
                      out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              asChild
              size="sm"
              className="bg-record-1 text-record-ink hover:bg-record-1/90"
            >
              <a href="/api/auth/discogs/start">Sign in with Discogs</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
