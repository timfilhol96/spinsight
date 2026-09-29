import { Link } from '@tanstack/react-router'
import { REPO_URL } from '#/lib/site'

const LINKS = [
  { to: '/about', label: 'How it works' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/trust', label: 'Trust & security' },
] as const

/**
 * Landing page and text pages. Carries the attribution the Discogs API terms
 * ask apps to show.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/70">
      <div className="page-wrap flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Link
            to="/"
            className="flex items-center gap-2 text-foreground no-underline"
          >
            <img src="/logo.svg" alt="" className="size-6" />
            <span className="font-display text-lg font-bold">Spinsight</span>
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Uses the Discogs API but is not affiliated with, sponsored or
            endorsed by Discogs. "Discogs" is a trademark of Zink Media, LLC.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:text-right">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: 'text-foreground' }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={REPO_URL}
                className="text-muted-foreground hover:text-foreground"
                rel="noreferrer"
                target="_blank"
              >
                Source code
              </a>
            </li>
            <li>
              <a
                href={`${REPO_URL}/issues`}
                className="text-muted-foreground hover:text-foreground"
                rel="noreferrer"
                target="_blank"
              >
                Contact & feedback
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}

/** Shell for Privacy, Terms, Trust and How it works. */
export function TextPage({
  kicker,
  title,
  lead,
  updated,
  children,
}: {
  kicker: string
  title: string
  lead: string
  updated?: string
  children: React.ReactNode
}) {
  return (
    <>
      <main className="page-wrap pt-12 pb-8">
        <article className="mx-auto max-w-2xl">
          <p className="kicker">{kicker}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{lead}</p>
          {updated && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Last updated {updated}
            </p>
          )}
          <div className="legal prose mt-10 max-w-none prose-headings:tracking-tight prose-h2:mt-12 prose-h2:text-2xl prose-a:underline-offset-4 prose-code:before:content-none prose-code:after:content-none">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
