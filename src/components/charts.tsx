import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Table2 } from 'lucide-react'
import { cn } from '#/lib/utils'
import type { Ranked } from '#/lib/stats'

// Chart conventions (one place, so every chart matches):
// single series in the shop accent, thin marks with 4px rounded data-ends,
// solid hairline grid, tooltip on every mark, numbers in the sans face, and a
// table view on every card so no value is tooltip-only.

const ACCENT = 'var(--primary)'
const CONTEXT = 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)'
const AXIS = {
  stroke: 'var(--muted-foreground)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card/80 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      {sub && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
      )}
    </div>
  )
}

type TableData = { columns: string[]; rows: Array<Array<string | number>> }

export function ChartCard({
  title,
  subtitle,
  table,
  className,
  children,
}: {
  title: string
  subtitle?: string
  table?: TableData
  className?: string
  children: React.ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section
      className={cn('rounded-2xl border bg-card/80 p-5 md:p-6', className)}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold leading-tight">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {table && table.rows.length > 0 && (
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
          >
            <Table2 className="size-3.5" /> Table
          </button>
        )}
      </header>
      {asTable && table ? <DataTable {...table} /> : children}
    </section>
  )
}

function DataTable({ columns, rows }: TableData) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {columns.map((c, i) => (
              <th
                key={c}
                className={cn('py-1.5 font-medium', i > 0 && 'text-right')}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-border/50 last:border-0">
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={cn('py-1.5', i > 0 && 'text-right tabular-nums')}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TooltipBox({
  value,
  label,
}: {
  value: React.ReactNode
  label: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="text-sm font-semibold text-popover-foreground">
        {value}
      </div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  )
}

const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

/** Vertical columns for ordered categories (decades, years, weekdays). */
export function ColumnChart({
  data,
  unit = 'record',
  onSelect,
  highlight,
  height = 200,
}: {
  data: Array<{ label: string; count: number }>
  unit?: string
  onSelect?: (label: string) => void
  /** Emphasis: this column in the accent, the rest as context. */
  highlight?: string
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          {...AXIS}
          interval="preserveStartEnd"
          minTickGap={8}
        />
        <YAxis {...AXIS} allowDecimals={false} width={48} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <TooltipBox
                value={plural(Number(payload[0].value), unit)}
                label={(payload[0].payload as { label: string }).label}
              />
            ) : null
          }
        />
        <Bar
          dataKey="count"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          onClick={
            onSelect
              ? (d) => onSelect((d.payload as { label: string }).label)
              : undefined
          }
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          {data.map((d) => (
            <Cell
              key={d.label}
              fill={!highlight || d.label === highlight ? ACCENT : CONTEXT}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Running total over time: one series, 2px line, 10% wash, crosshair tooltip. */
export function GrowthChart({
  data,
  height = 240,
}: {
  data: Array<{ label: string; added: number; total: number }>
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" {...AXIS} minTickGap={40} />
        <YAxis {...AXIS} allowDecimals={false} width={48} />
        <Tooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null
            const p = payload[0].payload as {
              label: string
              added: number
              total: number
            }
            return (
              <TooltipBox
                value={plural(p.total, 'record')}
                label={`${p.label}${p.added ? ` · +${p.added} that month` : ''}`}
              />
            )
          }}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={ACCENT}
          strokeWidth={2}
          fill={ACCENT}
          fillOpacity={0.1}
          activeDot={{
            r: 4,
            stroke: 'var(--card)',
            strokeWidth: 2,
            fill: ACCENT,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/**
 * Ranked horizontal bars built in HTML: long names stay readable and each row
 * is a real button when it links through to the filtered collection.
 */
export function BarList({
  items,
  total,
  onSelect,
  unit = 'record',
}: {
  items: Ranked[]
  /** Denominator for the share shown after each count. */
  total: number
  onSelect?: (name: string) => void
  unit?: string
}) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
  const max = items[0].count
  return (
    <ol className="space-y-2.5">
      {items.map((item) => {
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {item.count}
                {total > 0 && (
                  <span className="ml-1.5">
                    {Math.round((item.count / total) * 100)}%
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.max(2, (item.count / max) * 100)}%` }}
              />
            </div>
          </>
        )
        return (
          <li key={item.name}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.name)}
                className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                title={`${plural(item.count, unit)} · show them`}
              >
                {body}
              </button>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export const rankedTable = (
  items: Ranked[],
  first: string,
  total: number,
): TableData => ({
  columns: [first, 'Records', 'Share'],
  rows: items.map((i) => [
    i.name,
    i.count,
    total ? `${Math.round((i.count / total) * 100)}%` : '—',
  ]),
})

export type Paired = { name: string; mine: number; theirs: number }

/** "You" and "them" swatches, above every two-person chart. */
export function PairLegend({ them }: { them: string }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-primary" aria-hidden /> You
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-friend" aria-hidden /> {them}
      </span>
    </div>
  )
}

/**
 * You vs. them per category, as a share of each collection (so a small and a
 * large collection compare fairly). Two thin bars per row, values in text.
 */
export function PairedBars({
  items,
  mineTotal,
  theirsTotal,
  them,
}: {
  items: Paired[]
  mineTotal: number
  theirsTotal: number
  them: string
}) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>
  const share = (n: number, total: number) => (total ? n / total : 0)
  const max = Math.max(
    ...items.flatMap((i) => [
      share(i.mine, mineTotal),
      share(i.theirs, theirsTotal),
    ]),
  )
  const pct = (n: number, total: number) =>
    `${Math.round(share(n, total) * 100)}%`
  const bar = (n: number, total: number, color: string) => (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          color,
        )}
        style={{
          width: `${n ? Math.max(2, (share(n, total) / (max || 1)) * 100) : 0}%`,
        }}
      />
    </div>
  )
  return (
    <div>
      <PairLegend them={them} />
      <ol className="mt-4 space-y-3">
        {items.map((item) => (
          <li
            key={item.name}
            title={`${item.name}: you ${plural(item.mine, 'record')} (${pct(item.mine, mineTotal)}), ${them} ${plural(item.theirs, 'record')} (${pct(item.theirs, theirsTotal)})`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {pct(item.mine, mineTotal)}
                <span className="mx-1 opacity-50">·</span>
                {pct(item.theirs, theirsTotal)}
              </span>
            </div>
            <div className="space-y-0.5">
              {bar(item.mine, mineTotal, 'bg-primary')}
              {bar(item.theirs, theirsTotal, 'bg-friend')}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export const pairedTable = (
  items: Paired[],
  first: string,
  them: string,
): TableData => ({
  columns: [first, 'You', them],
  rows: items.map((i) => [i.name, i.mine, i.theirs]),
})
