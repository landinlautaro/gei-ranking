import { useLayoutEffect, useRef, useState } from 'react'
import type { PositionPoint } from '../api/types'
import { formatDate } from '../lib/format'
import { buttonClass } from './ui'

// Chart colors live here as tokens so a dark theme can swap them in one place. Single series: no legend needed.
const LINE = 'var(--chart-line, #2a78d6)'
const GRID = 'var(--chart-grid, #e4e4e0)'
const SURFACE = 'var(--chart-surface, #ffffff)'

const HEIGHT = 220
const MARGIN = { top: 14, right: 16, bottom: 30, left: 40 }
const DAY = 86_400_000

function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(600)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || 600)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || 600))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return width
}

interface Point {
  t: number
  position: number | null
  at: string
}

const RANGES = [
  { id: 'month', label: '1 mes', days: 30 },
  { id: 'quarter', label: '3 meses', days: 90 },
  { id: 'all', label: 'Todo', days: null },
] as const

type RangeId = (typeof RANGES)[number]['id']

/** The points from `start` on, opened with the position held at that moment so the line does not begin in thin air. */
function clipFrom(all: Point[], start: number): Point[] {
  const held = all.filter((d) => d.t <= start).at(-1)
  const after = all.filter((d) => d.t > start)
  return held ? [{ t: start, position: held.position, at: new Date(start).toISOString() }, ...after] : after
}

interface PositionChartProps {
  points: PositionPoint[]
  /** When the player joined: the chart never starts earlier than this (nor than the first recorded position). */
  from?: Date
  /** Where the last position ends; defaults to now. */
  until?: Date
}

/** Position over time with a range filter (1 mes / 3 meses / Todo). "Todo" starts when the player joined. */
export function PositionChart({ points, from, until }: PositionChartProps) {
  const [range, setRange] = useState<RangeId>('all')
  const [now] = useState(() => Date.now())

  const all: Point[] = points.map((p) => ({ t: Date.parse(p.at), position: p.position, at: p.at }))
  if (!all.some((d) => d.position !== null)) {
    return <p className="text-slate-700">Todavía no hay historial de posiciones.</p>
  }

  const end = Math.max(until?.getTime() ?? now, all[all.length - 1].t)
  const baseStart = Math.max(from?.getTime() ?? all[0].t, all[0].t)
  const days = RANGES.find((r) => r.id === range)!.days
  const start = days === null ? baseStart : Math.max(baseStart, end - days * DAY)
  const data = clipFrom(all, start)

  return (
    <div>
      <div role="group" aria-label="Rango del gráfico" className="mb-2 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={range === r.id}
            onClick={() => setRange(r.id)}
            className={buttonClass(range === r.id ? 'primary' : 'secondary')}
          >
            {r.label}
          </button>
        ))}
      </div>
      {data.some((d) => d.position !== null) ? (
        <StepChart key={range} data={data} until={end} />
      ) : (
        <p className="text-slate-700">No estuvo en el ranking en este período.</p>
      )}
    </div>
  )
}

/**
 * Position over time as a step line (a position holds until the next change). #1 is at the top.
 * Hover or arrow keys read a point; the same data is available as a table.
 */
function StepChart({ data, until }: { data: Point[]; until: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(containerRef)
  const [active, setActive] = useState<number | null>(null)

  const ranked = data.filter((d): d is Point & { position: number } => d.position !== null)

  const tStart = data[0].t
  const tEnd = Math.max(until, data[data.length - 1].t, tStart + DAY)
  const best = Math.min(...ranked.map((d) => d.position))
  const worst = Math.max(...ranked.map((d) => d.position))
  const yMin = best === worst ? Math.max(1, best - 2) : Math.max(1, best - 1)
  const yMax = best === worst ? worst + 2 : worst + 1

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 50)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (t: number) => MARGIN.left + ((t - tStart) / (tEnd - tStart)) * plotW
  const y = (position: number) => MARGIN.top + ((position - yMin) / (yMax - yMin)) * plotH

  // Step path per stretch in the ranking; a null position ends the stretch.
  const segments: string[] = []
  let current = ''
  for (const d of data) {
    if (d.position === null) {
      if (current) segments.push(`${current}H${x(d.t)}`)
      current = ''
    } else {
      current = current ? `${current}H${x(d.t)}V${y(d.position)}` : `M${x(d.t)} ${y(d.position)}`
    }
  }
  if (current) segments.push(`${current}H${x(tEnd)}`)

  const tickStep = Math.max(1, Math.ceil((yMax - yMin) / 4))
  const yTicks: number[] = []
  for (let p = yMin; p <= yMax; p += tickStep) yTicks.push(p)

  // Three dates do not fit on a phone: keep only the ends.
  const xTicks = (width < 420 ? [0, 1] : [0, 0.5, 1]).map((f) => ({
    left: MARGIN.left + f * plotW,
    anchor: f === 0 ? 'start' : f === 1 ? 'end' : 'middle',
    label: formatDate(new Date(tStart + f * (tEnd - tStart)).toISOString()),
  }))

  const nearest = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const px = clientX - (rect?.left ?? 0)
    let index = 0
    ranked.forEach((d, i) => {
      if (Math.abs(x(d.t) - px) < Math.abs(x(ranked[index].t) - px)) index = i
    })
    return index
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    setActive((i) => Math.min(ranked.length - 1, Math.max(0, (i ?? ranked.length - 1) + step)))
  }

  const point = active === null ? null : ranked[active]
  const summary = `Evolución de la posición: de #${ranked[0].position} a #${ranked[ranked.length - 1].position}, mejor posición #${best}.`

  return (
    <div>
      <div
        ref={containerRef}
        className="relative touch-pan-y select-none"
        tabIndex={0}
        role="group"
        aria-label={`${summary} Usá las flechas para recorrer los cambios.`}
        onPointerMove={(e) => setActive(nearest(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((i) => i ?? ranked.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true" className="block">
          {yTicks.map((p) => (
            <g key={p}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(p)} y2={y(p)} stroke={GRID} strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(p)} dy="0.32em" textAnchor="end" className="fill-slate-700 text-xs">
                #{p}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.left} x={t.left} y={HEIGHT - 8} textAnchor={t.anchor as 'start' | 'middle' | 'end'} className="fill-slate-700 text-xs">
              {t.label}
            </text>
          ))}
          {point && <line x1={x(point.t)} x2={x(point.t)} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke={GRID} strokeWidth={1} />}
          {segments.map((d) => (
            <path key={d} d={d} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {ranked.map((d, i) => (
            <circle
              key={`${d.at}-${i}`}
              cx={x(d.t)}
              cy={y(d.position)}
              r={active === i ? 6 : 4}
              fill={LINE}
              stroke={SURFACE}
              strokeWidth={2}
            />
          ))}
        </svg>

        {point && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-center shadow-md"
            style={{ left: Math.min(Math.max(x(point.t), 44), width - 44), top: Math.max(y(point.position) - 10, 40) }}
          >
            <div className="text-base font-bold tabular-nums text-slate-900">#{point.position}</div>
            <div className="text-xs text-slate-700">{formatDate(point.at)}</div>
          </div>
        )}
      </div>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-slate-700 underline-offset-2 hover:underline">Ver como tabla</summary>
        <table className="mt-2 w-full max-w-xs text-left">
          <thead>
            <tr className="border-b border-slate-200 text-slate-700">
              <th className="py-1 pr-4 font-medium">Fecha</th>
              <th className="py-1 font-medium">Posición</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={`${d.at}-${i}`} className="border-b border-slate-100">
                <td className="py-1 pr-4 tabular-nums">{formatDate(d.at)}</td>
                <td className="py-1 tabular-nums">{d.position === null ? 'Fuera del ranking' : `#${d.position}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
