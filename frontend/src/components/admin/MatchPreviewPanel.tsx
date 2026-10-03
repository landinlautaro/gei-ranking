import type { MatchPreview } from '../../api/adminTypes'
import { messageForCode } from '../../lib/errors'
import { plural } from '../../lib/format'
import { Notice } from '../ui'

const fieldNames: Record<string, string> = {
  challengerId: 'Desafiante',
  challengedId: 'Desafiado',
  playedAt: 'Fecha',
  score: 'Resultado',
  winner: 'Ganador',
  notes: 'Observaciones',
  match: 'Partido',
}

interface Props {
  /** null until the form is complete enough to evaluate. */
  preview: MatchPreview | undefined
  loading: boolean
  failed: boolean
  winnerName: string | null
}

/** What the match would do, before saving: winner, movement, range warning and side effects on later matches. */
export function MatchPreviewPanel({ preview, loading, failed, winnerName }: Props) {
  if (failed) return <Notice tone="error" live>No se pudo calcular la vista previa. Revisá la conexión.</Notice>
  if (!preview) return <Notice>Completá jugadores, fecha y resultado para ver el movimiento que se va a aplicar.</Notice>

  const errors = Object.entries(preview.errors).flatMap(([field, codes]) =>
    codes.map((code) => ({ key: `${field}-${code}`, text: `${fieldNames[field] ?? field}: ${messageForCode(code)}` })),
  )

  return (
    <section aria-label="Vista previa" aria-busy={loading} className={loading ? 'opacity-60' : undefined}>
      <h2 className="mb-2 text-lg font-semibold">Vista previa</h2>
      <div className="space-y-3" aria-live="polite">
        {errors.length > 0 && (
          <Notice tone="error">
            <ul className="list-inside list-disc space-y-1">
              {errors.map((e) => (
                <li key={e.key}>{e.text}</li>
              ))}
            </ul>
          </Notice>
        )}

        {errors.length === 0 && preview.movementText && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
            {winnerName && <p className="font-semibold">Gana {winnerName}</p>}
            <p className="mt-1">{preview.movementText}</p>
            {preview.challengerPositionBefore !== null && (
              <p className="mt-1 text-sm">
                Desafiante: #{preview.challengerPositionBefore} → #{preview.challengerPositionAfter} · Desafiado: #
                {preview.challengedPositionBefore} → #{preview.challengedPositionAfter}
              </p>
            )}
          </div>
        )}

        {preview.requiresOutOfRangeConfirmation && (
          <Notice tone="warning">
            <strong>Fuera de rango:</strong> el desafío es de más de 5 puestos o hacia abajo. Se puede guardar igual, pero hay que confirmarlo.
          </Notice>
        )}

        {preview.newlyWarnedMatchIds.length > 0 && (
          <Notice tone="warning">
            <strong>Atención:</strong> {plural(preview.newlyWarnedMatchIds.length, 'partido posterior', 'partidos posteriores')} quedaría
            {preview.newlyWarnedMatchIds.length === 1 ? '' : 'n'} fuera de rango con este cambio. No se bloquea: quedan marcados para revisar.
          </Notice>
        )}
      </div>
    </section>
  )
}
