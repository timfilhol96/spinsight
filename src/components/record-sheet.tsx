import { ExternalLink, Heart, Tag, Users } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Separator } from '#/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { VinylSwatch } from '#/components/record-card'
import { VinylDisc } from '#/components/vinyl-disc'
import { CoverPicker } from '#/components/cover-picker'
import { PlayButton, playSummary } from '#/components/play-button'
import { useMoney, useProfile } from '#/lib/use-profile'
import { formatDuration } from '#/lib/records'
import type { CollectionRecord } from '#/lib/records'
import { useRecordTheme } from '#/lib/theme'

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="kicker flex items-center gap-1.5">
        <Icon className="size-3" /> {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value ?? '—'}</p>
    </div>
  )
}

function RecordDetail({ record }: { record: CollectionRecord }) {
  // The whole app takes on this pressing's colour while it's open.
  useRecordTheme(record.look)
  const money = useMoney()
  const { isOwner } = useProfile()
  const wantRatio =
    record.communityHave && record.communityWant != null
      ? (record.communityWant / record.communityHave).toFixed(2)
      : null
  const duration = formatDuration(record.durationSec)

  return (
    <>
      {/* shrink-0: the sheet is a flex column, and with overflow-hidden this
          block would otherwise be squeezed to a sliver. */}
      <div className="relative -mx-6 -mt-6 shrink-0 overflow-hidden bg-gradient-to-br from-record-1/35 via-record-2/15 to-transparent px-6 pt-10 pb-8">
        <div className="relative mx-auto flex items-center">
          <div className="sleeve-shadow relative z-10 aspect-square w-[58%] shrink-0 overflow-hidden rounded-[3px] bg-muted">
            {record.coverImage && (
              <img
                src={record.coverImage}
                alt=""
                className="size-full object-cover"
              />
            )}
          </div>
          <VinylDisc
            look={record.look}
            labelImage={record.thumb}
            seed={record.releaseId}
            // Pulled roughly halfway out of the sleeve.
            className="-ml-[26%] w-[58%] shrink-0 animate-spin-slow"
          />
        </div>
      </div>

      <SheetHeader className="px-0">
        <SheetTitle className="font-display text-2xl leading-tight">
          {record.title}
        </SheetTitle>
        <SheetDescription className="text-base">
          {record.artist}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {record.originalYear ? (
            <span className="sticker" title="Original release">
              {record.originalYear}
            </span>
          ) : null}
          {record.year && record.year !== record.originalYear && (
            <span className="font-mono text-xs text-muted-foreground">
              pressed {record.year}
            </span>
          )}
          {record.country && (
            <span className="font-mono text-xs text-muted-foreground">
              {record.country}
            </span>
          )}
          {duration && (
            <span className="font-mono text-xs text-muted-foreground">
              · {duration}
            </span>
          )}
        </div>
      </SheetHeader>

      {isOwner && (
        <div className="flex flex-wrap items-center gap-3">
          <PlayButton record={record} />
          <span className="text-xs text-muted-foreground">
            {playSummary(record)}
          </span>
        </div>
      )}

      {isOwner && <CoverPicker record={record} />}

      <div className="space-y-5">
        <div className="flex items-center gap-2 rounded-lg border bg-background/60 p-3">
          <VinylSwatch
            colors={
              record.look.colors.length ? record.look.colors : ['#141414']
            }
            className="size-5"
          />
          <div>
            <p className="kicker">Pressing</p>
            <p className="text-sm font-medium">
              {record.look.label || 'Black vinyl'}
              {record.isSpecialEdition && (
                <span className="ml-1.5 rounded-full bg-sticker px-1.5 py-0.5 font-mono text-[10px] text-sticker-ink">
                  special edition
                </span>
              )}
              {record.formatDescriptions.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {record.formatDescriptions.join(', ')}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {record.genres.map((g) => (
            <Badge key={g} className="bg-record-1 text-record-ink">
              {g}
            </Badge>
          ))}
          {record.styles.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat
            icon={Users}
            label="Have"
            value={record.communityHave?.toLocaleString()}
          />
          <Stat
            icon={Heart}
            label="Want"
            value={record.communityWant?.toLocaleString()}
          />
          <Stat
            icon={Tag}
            label="From"
            value={money(record.lowestPrice, { compact: true })}
          />
        </div>
        {wantRatio && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Want/have ratio{' '}
            <span className="font-mono text-foreground">{wantRatio}</span>
            {Number(wantRatio) > 1
              ? ' — more people want this than own it.'
              : ''}
          </p>
        )}
        {!record.enriched && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Community stats appear once details are fetched.
          </p>
        )}

        {record.labels.length > 0 && (
          <div>
            <p className="kicker mb-1">Label</p>
            {record.labels.map((l) => (
              <p key={`${l.name}-${l.catno}`} className="text-sm">
                {l.name}{' '}
                <span className="font-mono text-xs text-muted-foreground">
                  {l.catno}
                </span>
              </p>
            ))}
          </div>
        )}

        {record.tracklist && record.tracklist.length > 0 && (
          <div>
            <p className="kicker mb-2">Tracklist</p>
            <ol className="space-y-1 text-sm">
              {record.tracklist.map((t, i) => (
                <li key={`${t.position}-${i}`} className="flex gap-3">
                  <span className="w-7 shrink-0 font-mono text-xs leading-5 text-muted-foreground">
                    {t.position}
                  </span>
                  <span className="flex-1">{t.title}</span>
                  <span className="font-mono text-xs leading-5 text-muted-foreground">
                    {t.duration}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {record.spotifyGenres.length > 0 && (
          <div>
            <p className="kicker mb-1">Spotify says</p>
            <p className="text-sm text-muted-foreground">
              {record.spotifyGenres.join(' · ')}
            </p>
          </div>
        )}

        <Separator />
        <a
          href={`https://www.discogs.com/release/${record.releaseId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-record-1 hover:underline"
        >
          View on Discogs <ExternalLink className="size-3.5" />
        </a>
      </div>
    </>
  )
}

export function RecordSheet({
  record,
  onOpenChange,
}: {
  record: CollectionRecord | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={!!record} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-lg">
        {record && <RecordDetail record={record} />}
      </SheetContent>
    </Sheet>
  )
}
