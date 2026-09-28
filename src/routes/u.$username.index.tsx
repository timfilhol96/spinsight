import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { RecordCard } from '#/components/record-card'
import { RecordSheet } from '#/components/record-sheet'
import { VinylDisc } from '#/components/vinyl-disc'
import { Input } from '#/components/ui/input'
import type { CollectionRecord } from '#/lib/records'
import { decadeOf, primaryLabel } from '#/lib/stats'
import { useProfile } from '#/lib/use-profile'
import { isColoredVinyl } from '#/lib/vinyl-color'

// Filters live in the URL so Insights can link to "show me those records".
export type CollectionSearch = {
  q?: string
  genre?: string
  style?: string
  /** Decade the music first came out. */
  decade?: number
  /** Decade this copy was pressed. */
  pressed?: number
  artist?: string
  label?: string
  country?: string
  colored?: boolean
  sort?: 'added' | 'artist' | 'year'
  /** Instance id of the open record card (the now-playing dock links here). */
  open?: number
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
const int = (v: unknown) =>
  v !== undefined && v !== '' && Number.isInteger(Number(v))
    ? Number(v)
    : undefined

export const Route = createFileRoute('/u/$username/')({
  validateSearch: (s: Record<string, unknown>): CollectionSearch => ({
    q: str(s.q),
    genre: str(s.genre),
    style: str(s.style),
    decade: int(s.decade),
    pressed: int(s.pressed),
    artist: str(s.artist),
    label: str(s.label),
    country: str(s.country),
    colored: s.colored === true || s.colored === 'true' ? true : undefined,
    sort: s.sort === 'artist' || s.sort === 'year' ? s.sort : undefined,
    open: int(s.open),
  }),
  head: ({ params }) => ({
    meta: [{ title: `${params.username}'s records · Spinsight` }],
  }),
  component: CollectionPage,
})

function matches(r: CollectionRecord, f: CollectionSearch): boolean {
  const q = f.q?.toLowerCase()
  return (
    (!f.genre || r.genres.includes(f.genre)) &&
    (!f.style || r.styles.includes(f.style)) &&
    (f.decade === undefined ||
      (!!r.originalYear && decadeOf(r.originalYear) === f.decade)) &&
    (f.pressed === undefined || (!!r.year && decadeOf(r.year) === f.pressed)) &&
    (!f.artist || r.artist === f.artist) &&
    (!f.label || primaryLabel(r) === f.label) &&
    (!f.country || r.country === f.country) &&
    (!f.colored || isColoredVinyl(r.look)) &&
    (!q ||
      r.title.toLowerCase().includes(q) ||
      r.artist.toLowerCase().includes(q) ||
      r.labels.some((l) => l.name.toLowerCase().includes(q)) ||
      r.styles.some((s) => s.toLowerCase().includes(q)))
  )
}

function CollectionPage() {
  const profile = useProfile()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const setSearch = (patch: Partial<CollectionSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  const genreCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of profile.records)
      for (const g of r.genres) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [profile.records])

  const visible = useMemo(() => {
    const list = profile.records.filter((r) => matches(r, search))
    const byArtist = (a: CollectionRecord, b: CollectionRecord) =>
      a.artist
        .replace(/^the\s+/i, '')
        .localeCompare(b.artist.replace(/^the\s+/i, ''))
    if (search.sort === 'artist') return [...list].sort(byArtist)
    if (search.sort === 'year')
      return [...list].sort(
        (a, b) =>
          (a.originalYear ?? 9999) - (b.originalYear ?? 9999) ||
          (a.year ?? 9999) - (b.year ?? 9999),
      )
    return list
  }, [profile.records, search])

  // Filters that came from Insights (not the genre chips) get their own pills.
  const pills = (
    [
      ['style', search.style],
      ['decade', search.decade !== undefined ? `${search.decade}s` : undefined],
      [
        'pressed',
        search.pressed !== undefined ? `${search.pressed}s` : undefined,
      ],
      ['artist', search.artist],
      ['label', search.label],
      ['country', search.country],
    ] as const
  ).filter(([, v]) => v !== undefined)

  const openRecord =
    profile.records.find((r) => r.instanceId === search.open) ?? null

  if (profile.records.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <VinylDisc look={null} className="w-40 opacity-80" />
        <h2 className="mt-6 text-2xl font-bold">The crate is empty</h2>
        <p className="mt-1 max-w-sm text-muted-foreground">
          {profile.isOwner
            ? 'Hit “Sync with Discogs” to pull in your collection.'
            : 'Nothing synced yet.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <section className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.q ?? ''}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            placeholder="Search title, artist, label, style"
            className="bg-card pl-9"
            aria-label="Search records"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={!search.genre && !search.colored}
            onClick={() => setSearch({ genre: undefined, colored: undefined })}
          >
            All
          </Chip>
          <Chip
            active={!!search.colored}
            onClick={() =>
              setSearch({ colored: search.colored ? undefined : true })
            }
          >
            Coloured vinyl
          </Chip>
          {genreCounts.map(([g, n]) => (
            <Chip
              key={g}
              active={search.genre === g}
              onClick={() =>
                setSearch({ genre: search.genre === g ? undefined : g })
              }
            >
              {g} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground md:ml-auto">
          Sort
          <select
            value={search.sort ?? 'added'}
            onChange={(e) =>
              setSearch({
                sort:
                  e.target.value === 'added'
                    ? undefined
                    : (e.target.value as CollectionSearch['sort']),
              })
            }
            className="rounded-md border bg-card px-2 py-1.5 text-foreground"
          >
            <option value="added">Recently added</option>
            <option value="artist">Artist A–Z</option>
            <option value="year">Release year</option>
          </select>
        </label>
      </section>

      {pills.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Showing</span>
          {pills.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSearch({ [key]: undefined })}
              className="flex items-center gap-1 rounded-full bg-record-1 px-3 py-1 text-xs font-medium text-record-ink"
              aria-label={`Remove ${key} filter ${value}`}
            >
              <span className="opacity-70">{key}:</span> {value}{' '}
              <X className="size-3" />
            </button>
          ))}
        </div>
      )}

      <section className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((r) => (
          <RecordCard
            key={r.instanceId}
            record={r}
            onOpen={() => setSearch({ open: r.instanceId })}
          />
        ))}
      </section>
      {visible.length === 0 && (
        <p className="mt-10 text-center text-muted-foreground">
          No records match that.
        </p>
      )}

      <RecordSheet
        record={openRecord}
        onOpenChange={(open) => !open && setSearch({ open: undefined })}
      />
    </>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-full border px-3 py-1 text-xs font-medium transition ' +
        (active
          ? 'border-record-1 bg-record-1 text-record-ink'
          : 'bg-card hover:border-record-1')
      }
    >
      {children}
    </button>
  )
}
