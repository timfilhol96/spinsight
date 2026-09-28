import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Dices,
  LocateFixed,
  RotateCcw,
  Shuffle,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { PlayButton, playSummary } from '#/components/play-button'
import { VinylSwatch } from '#/components/record-card'
import { RecordSheet } from '#/components/record-sheet'
import { VinylDisc } from '#/components/vinyl-disc'
import { Button } from '#/components/ui/button'
import {
  LENGTHS,
  MOODS,
  WEATHERS,
  availableFamilies,
  drawPick,
  randomPick,
  rankRecords,
  timeOfDay,
} from '#/lib/moods'
import type {
  Candidate,
  Length,
  Mood,
  PickAnswers,
  PlayInfo,
  Weather,
} from '#/lib/moods'
import type { CollectionRecord } from '#/lib/records'
import { formatDuration } from '#/lib/records'
import { useRecordTheme } from '#/lib/theme'
import { useProfile } from '#/lib/use-profile'
import { cn } from '#/lib/utils'
import { detectWeather } from '#/lib/weather'
import type { WeatherReading } from '#/lib/weather'

export const Route = createFileRoute('/u/$username/pick')({
  head: ({ params }) => ({
    meta: [{ title: `Pick a record · ${params.username} · Spinsight` }],
  }),
  component: PickPage,
})

type Stage =
  | { kind: 'start' }
  | { kind: 'questions'; step: number }
  | { kind: 'result'; pick: Candidate; mode: 'guided' | 'random' }

const STEPS = ['mood', 'weather', 'family', 'length'] as const

function PickPage() {
  const profile = useProfile()
  const records = profile.records
  const [stage, setStage] = useState<Stage>({ kind: 'start' })
  const [answers, setAnswers] = useState<PickAnswers>({})
  const [openId, setOpenId] = useState<number | null>(null)
  const shown = useRef(new Set<number>())

  const plays = useMemo(() => {
    const m = new Map<number, PlayInfo>()
    for (const r of records)
      m.set(r.releaseId, { count: r.playCount, lastPlayedAt: r.lastPlayedAt })
    return m
  }, [records])
  const families = useMemo(() => availableFamilies(records), [records])

  function surprise() {
    let record = randomPick(records, plays, shown.current)
    if (!record) {
      // Every record has been shown this session: start the rotation again.
      resetShown()
      record = randomPick(records, plays, shown.current)
    }
    if (!record) return
    shown.current.add(record.instanceId)
    setStage({
      kind: 'result',
      pick: { record, score: 1, reasons: ['Pure chance'] },
      mode: 'random',
    })
  }

  function resetShown() {
    shown.current = new Set()
  }

  function pickGuided(final: PickAnswers) {
    const withTime = { ...final, time: timeOfDay() }
    const ranked = rankRecords(records, withTime, plays)
    let pick = drawPick(ranked, shown.current)
    if (!pick) {
      resetShown()
      pick = drawPick(ranked, shown.current)
    }
    if (!pick) return
    shown.current.add(pick.record.instanceId)
    setStage({ kind: 'result', pick, mode: 'guided' })
  }

  function answer<TKey extends keyof PickAnswers>(
    key: TKey,
    value: PickAnswers[TKey],
    step: number,
  ) {
    const next = { ...answers, [key]: value }
    setAnswers(next)
    // Skip the family question when the collection only has one family.
    let nextStep = step + 1
    if (STEPS[nextStep] === 'family' && families.length < 2) nextStep++
    if (nextStep >= STEPS.length) pickGuided(next)
    else setStage({ kind: 'questions', step: nextStep })
  }

  function again() {
    if (stage.kind !== 'result') return
    if (stage.mode === 'random') surprise()
    else pickGuided(answers)
  }

  if (!records.length) {
    return (
      <p className="mt-16 text-center text-muted-foreground">
        Sync a collection first, then come back to pick.
      </p>
    )
  }

  const openRecord = records.find((r) => r.instanceId === openId) ?? null

  return (
    <div className="mt-8">
      {stage.kind === 'start' && (
        <StartScreen
          onSurprise={() => {
            resetShown()
            surprise()
          }}
          onGuided={() => {
            resetShown()
            setAnswers({})
            setStage({ kind: 'questions', step: 0 })
          }}
          count={records.length}
        />
      )}

      {stage.kind === 'questions' && (
        <Questions
          step={stage.step}
          answers={answers}
          families={families}
          onAnswer={answer}
          onBack={() =>
            setStage(
              stage.step === 0
                ? { kind: 'start' }
                : {
                    kind: 'questions',
                    step:
                      STEPS[stage.step - 1] === 'family' && families.length < 2
                        ? stage.step - 2
                        : stage.step - 1,
                  },
            )
          }
        />
      )}

      {stage.kind === 'result' && (
        <Result
          pick={stage.pick}
          mode={stage.mode}
          answers={answers}
          canPlay={profile.isOwner}
          onAgain={again}
          onRestart={() => setStage({ kind: 'start' })}
          onDetails={() => setOpenId(stage.pick.record.instanceId)}
        />
      )}

      <RecordSheet
        record={openRecord}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  )
}

function StartScreen({
  onSurprise,
  onGuided,
  count,
}: {
  onSurprise: () => void
  onGuided: () => void
  count: number
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
        What's going on the turntable?
      </h2>
      <p className="mt-3 text-muted-foreground">
        {count} records to choose from.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <ModeCard
          icon={Sparkles}
          title="Help me choose"
          body="Four quick taps: mood, weather, style, time."
          onClick={onGuided}
          primary
        />
        <ModeCard
          icon={Dices}
          title="Surprise me"
          body="Any record, skipping what you spun in the last few days."
          onClick={onSurprise}
        />
      </div>
    </div>
  )
}

function ModeCard({
  icon: Icon,
  title,
  body,
  onClick,
  primary,
}: {
  icon: typeof Dices
  title: string
  body: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group rounded-2xl border p-6 text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        primary
          ? 'border-record-1 bg-record-1 text-record-ink'
          : 'bg-card hover:border-record-1',
      )}
    >
      <Icon className="size-7 transition-transform duration-500 group-hover:rotate-180" />
      <p className="mt-4 text-xl font-bold">{title}</p>
      <p
        className={cn(
          'mt-1 text-sm',
          primary ? 'opacity-80' : 'text-muted-foreground',
        )}
      >
        {body}
      </p>
    </button>
  )
}

function Option({
  selected,
  onClick,
  title,
  hint,
  icon,
}: {
  selected?: boolean
  onClick: () => void
  title: string
  hint?: string
  icon?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-xl border p-4 text-left transition hover:border-record-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected ? 'border-record-1 bg-record-1/15' : 'bg-card',
      )}
    >
      <p className="font-semibold">
        {icon && (
          <span className="mr-2" aria-hidden>
            {icon}
          </span>
        )}
        {title}
      </p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </button>
  )
}

function Questions({
  step,
  answers,
  families,
  onAnswer,
  onBack,
}: {
  step: number
  answers: PickAnswers
  families: Array<{ id: string; label: string; count: number }>
  onAnswer: <TKey extends keyof PickAnswers>(
    key: TKey,
    value: PickAnswers[TKey],
    step: number,
  ) => void
  onBack: () => void
}) {
  const [reading, setReading] = useState<WeatherReading | null>(null)
  const [detecting, setDetecting] = useState(false)
  const key = STEPS[step]
  const total = families.length < 2 ? 3 : 4
  const position = families.length < 2 && step > 2 ? step : step + 1

  async function detect() {
    setDetecting(true)
    try {
      setReading(await detectWeather())
    } catch (e) {
      const msg =
        e instanceof GeolocationPositionError
          ? 'Location permission was denied.'
          : (e as Error).message
      toast.error(`Couldn't detect the weather. ${msg}`)
    } finally {
      setDetecting(false)
    }
  }

  const titles: Record<(typeof STEPS)[number], string> = {
    mood: 'What mood are you in?',
    weather: "What's it like outside?",
    family: 'What kind of thing?',
    length: 'How much time have you got?',
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <p className="font-mono text-xs text-muted-foreground">
          {position} / {total}
        </p>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              i < position ? 'bg-record-1' : 'bg-muted',
            )}
          />
        ))}
      </div>

      <h2
        key={key}
        className="rise-in mt-8 text-3xl font-bold tracking-tight md:text-4xl"
      >
        {titles[key]}
      </h2>

      <div
        key={`${key}-opts`}
        className="rise-in mt-6 grid gap-3 sm:grid-cols-2"
      >
        {key === 'mood' &&
          (Object.keys(MOODS) as Mood[]).map((m) => (
            <Option
              key={m}
              title={MOODS[m].label}
              hint={MOODS[m].hint}
              selected={answers.mood === m}
              onClick={() => onAnswer('mood', m, step)}
            />
          ))}

        {key === 'weather' && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-4 sm:col-span-2">
              <p className="text-sm text-muted-foreground">
                {reading
                  ? `${reading.description}, ${reading.tempC}°C where you are.`
                  : 'Use your location to check the weather (it stays in your browser).'}
              </p>
              {reading ? (
                <Button
                  size="sm"
                  onClick={() => onAnswer('weather', reading.weather, step)}
                  className="bg-record-1 text-record-ink hover:bg-record-1/90"
                >
                  Use {WEATHERS[reading.weather].label.toLowerCase()}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={detect}
                  disabled={detecting}
                >
                  <LocateFixed className={detecting ? 'animate-pulse' : ''} />{' '}
                  Detect
                </Button>
              )}
            </div>
            {(Object.keys(WEATHERS) as Weather[]).map((w) => (
              <Option
                key={w}
                icon={WEATHERS[w].icon}
                title={WEATHERS[w].label}
                selected={
                  answers.weather === w ||
                  (!answers.weather && reading?.weather === w)
                }
                onClick={() => onAnswer('weather', w, step)}
              />
            ))}
          </>
        )}

        {key === 'family' &&
          families.map((f) => (
            <Option
              key={f.id}
              title={f.label}
              hint={`${f.count} records`}
              selected={answers.family === f.id}
              onClick={() => onAnswer('family', f.id, step)}
            />
          ))}

        {key === 'length' &&
          (Object.keys(LENGTHS) as Length[]).map((l) => (
            <Option
              key={l}
              title={LENGTHS[l].label}
              hint={LENGTHS[l].hint}
              selected={answers.length === l}
              onClick={() => onAnswer('length', l, step)}
            />
          ))}

        <Option
          title="Don't mind"
          hint="Skip this one"
          onClick={() => onAnswer(key, undefined, step)}
        />
      </div>
    </div>
  )
}

function Result({
  pick,
  mode,
  answers,
  canPlay,
  onAgain,
  onRestart,
  onDetails,
}: {
  pick: Candidate
  mode: 'guided' | 'random'
  answers: PickAnswers
  canPlay: boolean
  onAgain: () => void
  onRestart: () => void
  onDetails: () => void
}) {
  const r: CollectionRecord = pick.record
  useRecordTheme(r.look)
  const duration = formatDuration(r.durationSec)
  const context = mode === 'guided' ? { ...answers, mode } : { mode }

  return (
    // Keyed so each new pick replays the slide-out animation.
    <div
      key={r.instanceId}
      className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <div className="relative mx-auto flex w-full max-w-xl items-center">
        <div className="sleeve-shadow relative z-10 aspect-square w-[62%] shrink-0 overflow-hidden rounded-[3px] bg-muted">
          {r.coverImage && (
            <img src={r.coverImage} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="-ml-[30%] w-[62%] shrink-0 slide-out">
          <VinylDisc
            look={r.look}
            labelImage={r.thumb}
            seed={r.releaseId}
            className="animate-spin-slow"
          />
        </div>
      </div>

      <div className="rise-in">
        <p className="kicker">
          {mode === 'random' ? 'Pulled at random' : 'Tonight’s pick'}
        </p>
        <h2 className="mt-2 text-4xl leading-tight font-bold tracking-tight md:text-5xl">
          {r.title}
        </h2>
        <p className="mt-1 text-xl text-muted-foreground">{r.artist}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {r.originalYear && <span className="sticker">{r.originalYear}</span>}
          {duration && <span>{duration}</span>}
          {r.look.label && (
            <span className="flex items-center gap-1.5">
              <VinylSwatch colors={r.look.colors} /> {r.look.label}
            </span>
          )}
        </div>

        {pick.reasons.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {pick.reasons.map((reason) => (
              <li
                key={reason}
                className="rounded-full border bg-card px-3 py-1 text-xs"
              >
                {reason}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          {canPlay && (
            <PlayButton
              record={r}
              source="picker"
              context={context}
              size="lg"
            />
          )}
          <Button size="lg" variant="outline" onClick={onAgain}>
            <Shuffle /> Another one
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <button
            type="button"
            onClick={onDetails}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Record details
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <RotateCcw className="size-3.5" /> Start over
          </button>
        </div>
        {canPlay && (
          <p className="mt-6 text-xs text-muted-foreground">{playSummary(r)}</p>
        )}
      </div>
    </div>
  )
}
