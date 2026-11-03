import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Rows3, Search, X } from 'lucide-react'
import { RecordCard } from '#/components/record-card'
import { RecordSheet } from '#/components/record-sheet'
import { RecordTable } from '#/components/record-table'
import type { TableSort } from '#/components/record-table'
import { VinylDisc } from '#/components/vinyl-disc'
import { Input } from '#/components/ui/input'
import type { CollectionRecord } from '#/lib/records'
import { decadeOf, primaryLabel } from '#/lib/stats'
import { useProfile } from '#/lib/use-profile'
import { shelfOrder } from '#/lib/utils'
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
  sort?: TableSort
  /** Grid when absent. */
  view?: 'table'
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
    sort:
      s.sort === 'artist' || s.sort === 'title' || s.sort === 'year'
        ? s.sort
        : undefined,
    view: s.view === 'table' ? s.view : undefined,
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
    navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
      // Opening or closing a record keeps your place in the crate; a new
      // filter or sort changes the list, so it starts from the top.
      resetScroll: !(Object.keys(patch).length === 1 && 'open' in patch),
    })

  const options = useMemo(() => {
    const genres = new Map<string, number>()
    const decades = new Map<number, number>()
    const artists = new Set<string>()
    for (const r of profile.records) {
      for (const g of r.genres) genres.set(g, (genres.get(g) ?? 0) + 1)
      if (r.originalYear) {
        const d = decadeOf(r.originalYear)
        decades.set(d, (decades.get(d) ?? 0) + 1)
      }
      artists.add(r.artist)
    }
    return {
      genres: [...genres.entries()].sort((a, b) => b[1] - a[1]),
      decades: [...decades.entries()].sort((a, b) => a[0] - b[0]),
      artists: [...artists].sort(shelfOrder),
    }
  }, [profile.records])

  const visible = useMemo(() => {
    const list = profile.records.filter((r) => matches(r, search))
    if (search.sort === 'artist')
      return [...list].sort((a, b) => shelfOrder(a.artist, b.artist))
    if (search.sort === 'title')
      return [...list].sort(
        (a, b) =>
          shelfOrder(a.title, b.title) || shelfOrder(a.artist, b.artist),
      )
    if (search.sort === 'year')
      return [...list].sort(
        (a, b) =>
          (a.originalYear ?? 9999) - (b.originalYear ?? 9999) ||
          (a.year ?? 9999) - (b.year ?? 9999),
      )
    return list
  }, [profile.records, search])

  // Filters only Insights links to (no control of their own) get pills.
  const pills = (
    [
      ['style', search.style],
      [
        'pressed',
        search.pressed !== undefined ? `${search.pressed}s` : undefined,
      ],
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
      <section className="mt-8 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.q ?? ''}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            placeholder="Search title, artist, label, style"
            className="bg-card pl-9"
            aria-label="Search records"
          />
        </div>
        <select
          value={search.genre ?? ''}
          onChange={(e) => setSearch({ genre: e.target.value || undefined })}
          className={selectClass(!!search.genre)}
          aria-label="Genre"
        >
          <option value="">All genres</option>
          {options.genres.map(([g, n]) => (
            <option key={g} value={g}>
              {g} ({n})
            </option>
          ))}
        </select>
        <select
          value={search.decade ?? ''}
          onChange={(e) =>
            setSearch({
              decade: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className={selectClass(search.decade !== undefined)}
          aria-label="Decade"
        >
          <option value="">All decades</option>
          {options.decades.map(([d, n]) => (
            <option key={d} value={d}>
              {d}s ({n})
            </option>
          ))}
        </select>
        <ArtistFilter
          artists={options.artists}
          value={search.artist}
          onChange={(artist) => setSearch({ artist })}
        />
        <Chip
          active={!!search.colored}
          onClick={() =>
            setSearch({ colored: search.colored ? undefined : true })
          }
        >
          Coloured vinyl
        </Chip>
        <label className="flex items-center gap-2 text-sm text-muted-foreground lg:ml-auto">
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
            className={selectClass(false)}
          >
            <option value="added">Recently added</option>
            <option value="artist">Artist A–Z</option>
            <option value="title">Title A–Z</option>
            <option value="year">Release year</option>
          </select>
        </label>
        <ViewSwitch
          view={search.view ?? 'grid'}
          onChange={(view) =>
            setSearch({ view: view === 'grid' ? undefined : view })
          }
        />
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

      {search.view === 'table' ? (
        visible.length > 0 && (
          <RecordTable
            records={visible}
            sort={search.sort ?? 'added'}
            onSort={(sort) =>
              setSearch({ sort: sort === 'added' ? undefined : sort })
            }
            onOpen={(r) => setSearch({ open: r.instanceId })}
          />
        )
      ) : (
        <section className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((r) => (
            <RecordCard
              key={r.instanceId}
              record={r}
              onOpen={() => setSearch({ open: r.instanceId })}
            />
          ))}
        </section>
      )}
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

const selectClass = (active: boolean) =>
  'h-9 rounded-md border bg-card px-2 text-sm ' +
  (active ? 'border-record-1 text-foreground' : 'text-muted-foreground')

/**
 * Type-ahead over the artists in the collection. The filter only applies once
 * the text names one of them; free text stays the search box's job.
 */
function ArtistFilter({
  artists,
  value,
  onChange,
}: {
  artists: string[]
  value: string | undefined
  onChange: (artist: string | undefined) => void
}) {
  const [text, setText] = useState(value ?? '')
  const find = (t: string) =>
    artists.find((a) => a.toLowerCase() === t.trim().toLowerCase())

  // Follow the URL when the filter is set or cleared from elsewhere (an
  // Insights link, the back button), without wiping half-typed text.
  useEffect(() => {
    if (value !== undefined) setText(value)
    else setText((t) => (find(t) ? '' : t))
  }, [value])

  return (
    <div className="relative">
      <Input
        list="collection-artists"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const match = find(e.target.value)
          if (match !== value) onChange(match)
        }}
        placeholder="Any artist"
        aria-label="Artist"
        className={'h-9 w-44 bg-card pr-8 ' + (value ? 'border-record-1' : '')}
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('')
            if (value) onChange(undefined)
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear artist"
        >
          <X className="size-4" />
        </button>
      )}
      <datalist id="collection-artists">
        {artists.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </div>
  )
}

type View = NonNullable<CollectionSearch['view']> | 'grid'

const VIEWS = [
  { view: 'grid', label: 'Grid', icon: LayoutGrid },
  { view: 'table', label: 'Table', icon: Rows3 },
] as const

function ViewSwitch({
  view,
  onChange,
}: {
  view: View
  onChange: (view: View) => void
}) {
  return (
    <div className="flex h-9 rounded-md border bg-card p-0.5" role="group">
      {VIEWS.map(({ view: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          aria-label={`${label} view`}
          title={`${label} view`}
          className={
            'grid w-8 place-items-center rounded-[5px] transition ' +
            (view === v
              ? 'bg-record-1 text-record-ink'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
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
        'h-9 rounded-full border px-3 text-xs font-medium transition ' +
        (active
          ? 'border-record-1 bg-record-1 text-record-ink'
          : 'bg-card hover:border-record-1')
      }
    >
      {children}
    </button>
  )
}
