import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Palette, Shuffle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { VinylDisc } from '#/components/vinyl-disc'
import { useRecordTheme } from '#/lib/theme'
import { parseVinylLook } from '#/lib/vinyl-color'

type Search = { auth?: 'cancelled' | 'error' }

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    auth: s.auth === 'cancelled' || s.auth === 'error' ? s.auth : undefined,
  }),
  beforeLoad: ({ context }) => {
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
  const { auth } = Route.useSearch()
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
    <main className="page-wrap py-12 md:py-20">
      <section className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
        <div className="rise-in">
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
              <a href="/api/auth/discogs/start">Sign in with Discogs</a>
            </Button>
            <span className="text-sm text-muted-foreground">
              Free. Read-only access to your collection.
            </span>
          </div>

          <ul className="mt-12 grid gap-4 sm:grid-cols-3">
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
    </main>
  )
}
