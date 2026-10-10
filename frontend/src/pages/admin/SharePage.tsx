import { useState } from 'react'
import { useMatches, useRanking } from '../../api/queries'
import { CopyButton } from '../../components/CopyButton'
import { ErrorState, LoadingState } from '../../components/PageState'
import { Field, inputClass } from '../../components/ui'
import { rankingMessage } from '../../lib/whatsapp'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const CLUB_TIME_ZONE = 'America/Argentina/Buenos_Aires'
const MAX_RESULTS = 100

/** yyyy-MM-dd of the Monday of last week, in club local time: the Monday post reports the week that just ended. */
export function previousMonday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})
  const daysSinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday)
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - daysSinceMonday - 7))
  return date.toISOString().slice(0, 10)
}

export function SharePage() {
  useDocumentTitle('Publicar en WhatsApp')
  const [since, setSince] = useState(() => previousMonday())
  const ranking = useRanking()
  // An emptied date input falls back to the default instead of silently listing everything.
  const effectiveSince = since || previousMonday()
  const matches = useMatches({ from: effectiveSince, pageSize: MAX_RESULTS }, true)

  const ready = ranking.data && matches.data
  const text = ready
    ? rankingMessage({
        rows: ranking.data,
        matches: matches.data.items,
        publishedAt: new Date().toISOString(),
        since: `${effectiveSince}T12:00:00Z`,
        siteUrl: window.location.origin + '/',
      })
    : ''

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Publicar en WhatsApp</h1>
      <p className="mb-4 text-slate-700">Armá el mensaje del lunes con el ranking y los resultados, copialo y pegalo en el grupo.</p>

      <div className="max-w-xs">
        <Field label="Incluir resultados desde" hint="Por defecto, el lunes de la semana pasada.">
          <input type="date" className={inputClass} value={since} onChange={(e) => setSince(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4">
        {(ranking.isPending || matches.isPending) && <LoadingState label="Armando el mensaje…" />}
        {ranking.isError && <ErrorState error={ranking.error} onRetry={() => void ranking.refetch()} />}
        {matches.isError && <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />}
        {ready && (
          <div className="space-y-3">
            <pre
              aria-label="Vista previa del mensaje"
              className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-sans text-base"
            >
              {text}
            </pre>
            {matches.data.total > MAX_RESULTS && (
              <p className="text-sm text-amber-900">Hay más de {MAX_RESULTS} resultados en ese período: se incluyen los {MAX_RESULTS} más recientes.</p>
            )}
            <CopyButton label="Copiar mensaje" getText={() => text} />
          </div>
        )}
      </div>
    </>
  )
}
