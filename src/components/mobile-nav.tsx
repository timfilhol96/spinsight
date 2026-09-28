import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, CalendarHeart, Library, Shuffle } from 'lucide-react'
import { viewerQuery } from '#/lib/queries'

// Phone-only tab bar for your own collection, like a native app. The desktop
// header nav covers the same links.
const TABS = [
  { to: '/u/$username', label: 'Collection', icon: Library, exact: true },
  {
    to: '/u/$username/insights',
    label: 'Insights',
    icon: BarChart3,
    exact: false,
  },
  { to: '/u/$username/pick', label: 'Pick', icon: Shuffle, exact: false },
  {
    to: '/u/$username/wrapped',
    label: 'Year',
    icon: CalendarHeart,
    exact: false,
  },
] as const

export function MobileNav() {
  const { data: viewer } = useQuery(viewerQuery)
  if (!viewer) return null
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ to, label, icon: Icon, exact }) => (
          <li key={to}>
            <Link
              to={to}
              params={{ username: viewer.username }}
              activeOptions={{ exact, includeSearch: false }}
              className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: 'text-record-1' }}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
