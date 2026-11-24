import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { RecordRow } from '#/components/record-row'
import { RecordSheet } from '#/components/record-sheet'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import type { CollectionRecord } from '#/lib/records'
import * as S from '#/lib/stats'
import { useProfile } from '#/lib/use-profile'

// Listening history: every logged spin, newest first, a week at a time.
// Dates and times are the viewer's own, so it renders once mounted (the
// server doesn't know the viewer's time zone).

export const Route = createFileRoute('/u/$username/history')({
  head: ({ params }) => ({
    meta: [{ title: `History · ${params.username} · Spinsight` }],
  }),
  component: HistoryPage,
})

/** Weeks shown at first, and added by "Show older weeks". */
const WEEKS_PER_PAGE = 4

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
})
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const shortFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** "This week", "Last week", "10–16 Nov", "29 Dec – 4 Jan 2026". */
function weekTitle(start: Date, now: Date): string {
  const thisWeek = S.weekStart(now)
  if (start.getTime() === thisWeek.getTime()) return 'This week'
  // Days, not 7 × 24 h: a clock change makes one week an hour short or long.
  const lastWeek = new Date(thisWeek)
  lastWeek.setDate(lastWeek.getDate() - 7)
  if (start.getTime() === lastWeek.getTime()) return 'Last week'
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const year =
    end.getFullYear() !== now.getFullYear() ? ` ${end.getFullYear()}` : ''
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${shortFmt.format(end)}${year}`
    : `${shortFmt.format(start)} – ${shortFmt.format(end)}${year}`
}

function dayTitle(day: Date, now: Date): string {
  if (sameDay(day, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(day, yesterday)) return 'Yesterday'
  const label = dayFmt.format(day)
  return day.getFullYear() !== now.getFullYear()
    ? `${label} ${day.getFullYear()}`
    : label
}

function HistoryPage() {
  const profile = useProfile()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [shown, setShown] = useState(WEEKS_PER_PAGE)
  const [openId, setOpenId] = useState<number | null>(null)
  const openRecord =
    profile.records.find((r) => r.instanceId === openId) ?? null
  const open = (r: CollectionRecord) => setOpenId(r.instanceId)

  const weeks = useMemo(
    () => (mounted ? S.listeningHistory(profile.records, profile.plays) : []),
    [mounted, profile.records, profile.plays],
  )

  if (profile.listeningHidden) {
    return (
      <p className="mt-16 text-center text-muted-foreground">
        {profile.displayName || profile.username} keeps their listening private.
      </p>
    )
  }

  if (!mounted) {
    return (
      <div className="mt-10 space-y-3" aria-hidden>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
      </div>
    )
  }

  if (!weeks.length) {
    return (
      <div className="mt-10 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
        No spins logged yet.{' '}
        {profile.isOwner && (
          <>
            Hit “I'm playing this” on a record, or{' '}
            <Link
              to="/u/$username/pick"
              params={{ username: profile.username }}
              className="font-medium text-record-1 underline-offset-4 hover:underline"
            >
              let the picker choose
            </Link>
            . Every spin shows up here.
          </>
        )}
      </div>
    )
  }

  const now = new Date()
  return (
    <>
      {weeks.slice(0, shown).map((week) => (
        <section key={week.start.getTime()} className="mt-10">
          <p className="kicker">
            {week.spins} {week.spins === 1 ? 'spin' : 'spins'} ·{' '}
            {week.estimated ? '~' : ''}
            {S.formatListening(week.totalSec)}
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">
            {weekTitle(week.start, now)}
          </h2>
          <WeekHighlights week={week} onOpen={open} />

          <div className="mt-4 space-y-5 rounded-2xl border bg-card/80 p-4 sm:p-5">
            {week.days.map((day) => (
              <div key={day.start.getTime()}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {dayTitle(day.start, now)}
                </h3>
                <ol className="space-y-0.5">
                  {day.spins.map((spin) => (
                    <RecordRow
                      key={spin.play.id}
                      record={spin.record}
                      onOpen={() => open(spin.record)}
                      metric={<SpinTime spin={spin} />}
                    />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      ))}

      {weeks.length > shown && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            onClick={() => setShown((n) => n + WEEKS_PER_PAGE)}
          >
            Show older weeks
          </Button>
        </div>
      )}

      <RecordSheet
        record={openRecord}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </>
  )
}

/** The week's most spun record and artist, when anything stood out. */
function WeekHighlights({
  week,
  onOpen,
}: {
  week: S.HistoryWeek
  onOpen: (r: CollectionRecord) => void
}) {
  const top = week.topRecord
  const artist =
    week.topArtist && week.topArtist.count > 1 ? week.topArtist : null
  if (!top && !artist) return null
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {top && (
        <>
          Most played:{' '}
          <button
            type="button"
            onClick={() => onOpen(top.record)}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {top.record.title}
          </button>{' '}
          ({top.count}×)
        </>
      )}
      {top && artist && ' · '}
      {artist && (
        <>
          Top artist:{' '}
          <span className="font-medium text-foreground">{artist.name}</span> (
          {artist.count} spins)
        </>
      )}
    </p>
  )
}

/** "20:15" over "42 min", or "Spinning" while it may still be on. */
function SpinTime({ spin }: { spin: S.HistorySpin }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span>{timeFmt.format(new Date(spin.play.playedAt))}</span>
      <span
        className="text-xs font-normal text-muted-foreground"
        title={
          spin.estimated ? 'No track times: counted as a typical LP' : undefined
        }
      >
        {spin.playing
          ? 'Spinning'
          : `${spin.estimated ? '~' : ''}${S.formatListening(spin.sec)}`}
      </span>
    </span>
  )
}
