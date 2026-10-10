import { movementDescription } from '../lib/format'

/**
 * ▲3 green (moved up), ▼1 red (moved down), — gray. The arrow and number carry the meaning, color only reinforces it.
 * `verbose` shows the sentence ("Subió 3 puestos") instead of the compact symbol.
 */
export function MovementBadge({ movement, verbose = false }: { movement: number; verbose?: boolean }) {
  const tone = movement > 0 ? 'text-green-700' : movement < 0 ? 'text-red-700' : 'text-slate-700'
  const label = movement > 0 ? `▲${movement}` : movement < 0 ? `▼${-movement}` : '—'

  if (verbose) {
    return (
      <span className={`text-lg font-semibold ${tone}`}>
        <span aria-hidden="true">{movement > 0 ? '▲ ' : movement < 0 ? '▼ ' : ''}</span>
        {movementDescription(movement)}
      </span>
    )
  }

  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{movementDescription(movement)}</span>
    </span>
  )
}
