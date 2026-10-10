import { movementDescription } from '../lib/format'

/** ▲3 green (moved up), ▼1 red (moved down), — gray. The arrow and number carry the meaning, color only reinforces it. */
export function MovementBadge({ movement }: { movement: number }) {
  const tone = movement > 0 ? 'text-green-700' : movement < 0 ? 'text-red-700' : 'text-slate-700'
  const label = movement > 0 ? `▲${movement}` : movement < 0 ? `▼${-movement}` : '—'

  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{movementDescription(movement)}</span>
    </span>
  )
}
