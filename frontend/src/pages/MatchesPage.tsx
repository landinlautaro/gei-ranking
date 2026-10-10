import { useSearchParams } from 'react-router-dom'
import { useMatches, usePlayers } from '../api/queries'
import { MatchCard } from '../components/MatchCard'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const PAGE_SIZE = 20

const fieldClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600'

export function MatchesPage() {
  useDocumentTitle('Partidos')
  const [params, setParams] = useSearchParams()

  const playerId = Number(params.get('playerId')) || undefined
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const invalidRange = from !== '' && to !== '' && from > to

  const players = usePlayers()
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useMatches(
    { playerId, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE },
    !invalidRange,
  )

  // Any filter change goes back to page 1. Filters live in the URL so a filtered list can be shared.
  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const hasFilters = Boolean(playerId || from || to)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <h1 className="sr-only">Partidos</h1>

      <form className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="player" className="mb-1 block text-sm font-medium text-slate-700">Jugador</label>
          <select id="player" value={playerId ?? ''} onChange={(e) => update({ playerId: e.target.value })} className={fieldClass}>
            <option value="">Todos los jugadores</option>
            {players.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.fullName}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <div>
            <label htmlFor="from" className="mb-1 block text-sm font-medium text-slate-700">Desde</label>
            <input id="from" type="date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-sm font-medium text-slate-700">Hasta</label>
            <input id="to" type="date" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} className={fieldClass} />
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams())}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600"
          >
            Limpiar filtros
          </button>
        )}
      </form>

      <div className="mt-4" aria-busy={isPlaceholderData}>
        {invalidRange && (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
            La fecha “Desde” no puede ser posterior a “Hasta”.
          </p>
        )}
        {!invalidRange && isPending && <LoadingState label="Cargando partidos…" />}
        {!invalidRange && isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {data && data.items.length === 0 && (
          <EmptyState>{hasFilters ? 'No hay partidos con esos filtros.' : 'Todavía no se jugaron partidos.'}</EmptyState>
        )}
        {data && data.items.length > 0 && (
          <>
            <p className="mb-2 text-sm text-slate-600">
              {data.total} {data.total === 1 ? 'partido' : 'partidos'}
            </p>
            <ul className={`space-y-2 ${isPlaceholderData ? 'opacity-60' : ''}`}>
              {data.items.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </ul>
            {totalPages > 1 && (
              <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => update({ page: String(page - 1) })}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium enabled:hover:bg-slate-100 disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <span className="text-sm text-slate-600">Página {page} de {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => update({ page: String(page + 1) })}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium enabled:hover:bg-slate-100 disabled:opacity-40"
                >
                  Siguiente →
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </>
  )
}
