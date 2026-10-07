import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Palette, Shuffle, Users } from 'lucide-react'
import { SiteFooter } from '#/components/site-footer'
import { Button } from '#/components/ui/button'
import { VinylDisc } from '#/components/vinyl-disc'
import { USERNAME_RE } from '#/lib/friends'
import { useRecordTheme } from '#/lib/theme'
import { parseVinylLook } from '#/lib/vinyl-color'

type Search = {
  auth?: 'cancelled' | 'error'
  /** Username from a friend's invite link. */
  invite?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    auth: s.auth === 'cancelled' || s.auth === 'error' ? s.auth : undefined,
    invite:
      typeof s.invite === 'string' && USERNAME_RE.test(s.invite)
        ? s.invite
        : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    // Already signed in: go straight to comparing with whoever invited you.
    if (context.viewer && search.invite) {
      throw redirect({
        to: '/friends/$username',
        params: { username: search.invite },
      })
    }
    if (context.viewer) {
      throw redirect({
        to: '/u/$username',
        params: { username: context.viewer.username },
      })
    }
  },
  component: Landing,
})

// Real Discogs format strings, to show off the colour-variant parsing.
const SAMPLES = [
  'Red Translucent',
  'Black & Gold Marbled',
  'Clear With Blue Splatter',
  'Coke Bottle Clear',
  'Orange In Clear',
  'Half Mint / Half Pink',
].map((text, i) => ({
  text,
  look: parseVinylLook([{ name: 'Vinyl', text }]),
  seed: 7 + i * 13,
}))

function Landing() {
  const { auth, invite } = Route.useSearch()
  const signIn = invite
    ? `/api/auth/discogs/start?invite=${encodeURIComponent(invite)}`
    : '/api/auth/discogs/start'
  const [active, setActive] = useState(0)
  useRecordTheme(SAMPLES[active].look)

  useEffect(() => {
    if (auth === 'error')
      toast.error('Discogs sign-in failed. Please try again.')
    if (auth === 'cancelled') toast('Sign-in cancelled.')
  }, [auth])

  useEffect(() => {
    const id = setInterval(
      () => setActive((a) => (a + 1) % SAMPLES.length),
      3500,
    )
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <main className="page-wrap py-12 md:py-20">
        <section className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div className="rise-in">
            {invite && (
              <p className="mb-6 flex items-center gap-2 rounded-xl border border-record-1/50 bg-card/80 px-4 py-3 text-sm">
                <Users className="size-4 shrink-0 text-record-1" />
                <span>
                  <span className="font-semibold">{invite}</span> invited you to
                  compare record collections. Sign in and you'll follow them
                  straight away.
                </span>
              </p>
            )}
            <p className="kicker">For people who own too many records</p>
            <h1 className="mt-3 text-5xl leading-[1.02] font-bold tracking-tight md:text-7xl">
              Your crates,
              <br />
              <span className="text-record-1 italic">decoded.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground">
              Connect your Discogs collection to see what it says about you, and
              let it pick what goes on the turntable next.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-record-1 text-record-ink hover:bg-record-1/90"
              >
                <a href={signIn}>Sign in with Discogs</a>
              </Button>
              <span className="text-sm text-muted-foreground">
                Free. Read-only access to your collection.
              </span>
            </div>

            <ul className="mt-12 grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: BarChart3,
                  title: 'Collection stats',
                  body: 'Genres, decades, labels, value, rarities.',
                },
                {
                  icon: Shuffle,
                  title: 'Record picker',
                  body: 'Random, or a few quick questions.',
                },
                {
                  icon: Users,
                  title: 'Friends',
                  body: 'See what they spin, compare crates.',
                },
                {
                  icon: Palette,
                  title: 'Colour variants',
                  body: 'The app takes on the colour of your pressing.',
                },
              ].map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-xl border bg-card/70 p-4">
                  <Icon className="size-5 text-record-1" />
                  <p className="mt-2 text-sm font-semibold">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <VinylDisc
              look={SAMPLES[active].look}
              seed={SAMPLES[active].seed}
              spinning
              className="w-full"
            />
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SAMPLES.map((s, i) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => setActive(i)}
                  className={
                    'rounded-full border px-3 py-1 font-mono text-xs transition ' +
                    (i === active
                      ? 'border-record-1 bg-record-1 text-record-ink'
                      : 'bg-card hover:border-record-1')
                  }
                >
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        </section>

        <AppPreview />
      </main>
      <SiteFooter />
    </>
  )
}

/** App screenshots (demo data), so visitors see the app before handing over Discogs. */
function AppPreview() {
  return (
    <section className="mt-24" aria-labelledby="preview-title">
      <p className="kicker">A look inside</p>
      <h2
        id="preview-title"
        className="mt-1 text-3xl font-bold tracking-tight md:text-4xl"
      >
        Every pressing in its own colour
      </h2>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Your shelf, the stats behind it, and a year-by-year recap you can share.
        Here's what a collection looks like.
      </p>
      {/* Phones: the phone view, since a desktop shot would be unreadable. */}
      <figure className="mx-auto mt-8 w-[72%] max-w-72 overflow-hidden rounded-[1.75rem] border-[6px] border-[#1b120c] shadow-2xl md:hidden">
        <img
          src="/screenshots/collection-narrow.webp"
          width={780}
          height={1688}
          loading="lazy"
          alt="A collection on a phone: album covers labelled with their year and vinyl colour."
          className="block h-auto w-full"
        />
      </figure>
      <div className="relative mt-8 hidden pb-10 md:block md:pr-24">
        <figure className="sleeve-shadow overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2.5 rounded-full bg-border" />
            ))}
          </div>
          <img
            src="/screenshots/collection-wide.webp"
            srcSet="/screenshots/collection-wide.webp 1280w, /screenshots/collection-wide@2x.webp 2560w"
            // The page is up to 1180px and the phone overlay takes 6rem.
            sizes="(min-width: 1212px) 1084px, calc(100vw - 8rem)"
            width={1280}
            height={800}
            loading="lazy"
            alt="A collection page: a grid of album covers, each labelled with its release year and vinyl colour, with genre filters above."
            className="block h-auto w-full"
          />
        </figure>
        <figure className="absolute right-0 -bottom-2 w-[23%] max-w-56 overflow-hidden rounded-[1.75rem] border-[6px] border-[#1b120c] shadow-2xl">
          <img
            src="/screenshots/year-narrow.webp"
            width={780}
            height={1688}
            loading="lazy"
            alt="Year in Vinyl on a phone: records added, coloured pressings, top genre and style for the year."
            className="block h-auto w-full"
          />
        </figure>
      </div>
    </section>
  )
}
