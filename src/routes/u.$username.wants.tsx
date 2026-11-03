import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { ExternalLink, Search, ShoppingBag } from 'lucide-react'
import { VinylSwatch } from '#/components/record-card'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { wantsOwnedBy } from '#/lib/friends'
import type { WantlistItem } from '#/lib/friends'
import { wantlistQuery } from '#/lib/queries'
import { buyLinks } from '#/lib/shops'
import { useProfile } from '#/lib/use-profile'
import { shelfOrder } from '#/lib/utils'
import { isColoredVinyl } from '#/lib/vinyl-color'

// The Discogs wantlist, mirrored on every sync, with a way to go and buy each
// record. Same visibility as the collection.

type Search = { q?: string; sort?: 'added' | 'artist' | 'title' }

export const Route = createFileRoute('/u/$username/wants')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    sort: s.sort === 'artist' || s.sort === 'title' ? s.sort : undefined,
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(wantlistQuery(params.username)),
  head: ({ params }) => ({
    meta: [{ title: `${params.username}'s wantlist · Spinsight` }],
  }),
  component: WantsPage,
})

function WantsPage() {
  const profile = useProfile()
  const { data: wants } = useSuspenseQuery(wantlistQuery(profile.username))
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setSearch = (patch: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  // Wants already on the shelf in some pressing (or this very one).
  const owned = useMemo(
    () =>
      new Map(
        wantsOwnedBy(wants, profile.records).map((m) => [
          m.want.releaseId,
          m.exact,
        ]),
      ),
    [wants, profile.records],
  )

  const visible = useMemo(() => {
    const q = search.q?.toLowerCase()
    const list = q
      ? wants.filter(
          (w) =>
            w.title.toLowerCase().includes(q) ||
            w.artist.toLowerCase().includes(q),
        )
      : wants
    if (search.sort === 'artist')
      return [...list].sort((a, b) => shelfOrder(a.artist, b.artist))
    if (search.sort === 'title')
      return [...list].sort(
        (a, b) =>
          shelfOrder(a.title, b.title) || shelfOrder(a.artist, b.artist),
      )
    return list
  }, [wants, search])

  if (wants.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <VinylDisc look={null} className="w-40 opacity-80" />
        <h2 className="mt-6 text-2xl font-bold">Nothing wanted yet</h2>
        <p className="mt-1 max-w-sm text-muted-foreground">
          {profile.isOwner
            ? 'Records you add to your wantlist on Discogs show up here after the next sync.'
            : 'This wantlist is empty.'}
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
            placeholder="Search title or artist"
            className="bg-card pl-9"
            aria-label="Search wants"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {wants.length} {wants.length === 1 ? 'record' : 'records'} on{' '}
          {profile.isOwner ? 'your' : 'the'} wantlist
          {profile.isOwner && (
            <>
              {' · '}
              <a
                href="https://www.discogs.com/mywantlist"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Edit on Discogs
              </a>
            </>
          )}
        </p>
        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:ml-auto">
          Sort
          <select
            value={search.sort ?? 'added'}
            onChange={(e) =>
              setSearch({
                sort:
                  e.target.value === 'added'
                    ? undefined
                    : (e.target.value as Search['sort']),
              })
            }
            className="h-9 rounded-md border bg-card px-2 text-sm text-muted-foreground"
          >
            <option value="added">Recently wanted</option>
            <option value="artist">Artist A–Z</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
      </section>

      <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((w) => (
          <WantCard key={w.releaseId} want={w} owned={owned.get(w.releaseId)} />
        ))}
      </ul>
      {visible.length === 0 && (
        <p className="mt-10 text-center text-muted-foreground">
          No wants match that.
        </p>
      )}
    </>
  )
}

function WantCard({
  want,
  owned,
}: {
  want: WantlistItem
  /** true: this very pressing is in the collection; false: another one is. */
  owned: boolean | undefined
}) {
  const cover = want.coverImage ?? want.thumb
  return (
    <li className="flex flex-col">
      <a
        href={`https://www.discogs.com/release/${want.releaseId}`}
        target="_blank"
        rel="noreferrer"
        className="group relative block aspect-square focus-visible:outline-none"
        aria-label={`${want.artist} – ${want.title} on Discogs`}
      >
        <div className="sleeve-shadow size-full overflow-hidden rounded-[3px] bg-muted ring-record-1 transition group-focus-visible:ring-2">
          {cover ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center p-3 text-center font-display text-sm text-muted-foreground">
              {want.title}
            </div>
          )}
        </div>
        {want.year ? (
          <span className="sticker absolute -top-2 -left-2">{want.year}</span>
        ) : null}
      </a>
      <div className="mt-3 pr-2">
        <p className="truncate font-semibold leading-tight">{want.title}</p>
        <p className="truncate text-sm text-muted-foreground">{want.artist}</p>
        {want.look && isColoredVinyl(want.look) && (
          <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
            <VinylSwatch colors={want.look.colors} />
            {want.look.label}
          </p>
        )}
        {owned !== undefined && (
          <p className="mt-1 truncate text-xs text-record-1">
            {owned ? 'Already in the collection' : 'Another pressing owned'}
          </p>
        )}
      </div>
      <div className="mt-auto pt-3">
        <BuyMenu want={want} />
      </div>
    </li>
  )
}

function BuyMenu({ want }: { want: WantlistItem }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ShoppingBag /> Buy
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {/* Built on open, so the local eBay and Amazon come from the browser. */}
        {buyLinks(want).map((l) => (
          <DropdownMenuItem key={l.shop} asChild>
            <a href={l.url} target="_blank" rel="noreferrer">
              {l.shop === 'Discogs' ? 'Discogs marketplace' : l.shop}
              <ExternalLink className="ml-auto" />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
