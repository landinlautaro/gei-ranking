import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAdminPlayers, useAdminMatches, useVoidMatch } from '../../api/admin'
import type { AdminMatch, MatchChangeResult, MatchStatus } from '../../api/adminTypes'
import { EmptyState, ErrorState, LoadingState } from '../../components/PageState'
import { Button, ConfirmButton, Notice, inputClass } from '../../components/ui'
import { describeError, messageForCode } from '../../lib/errors'
import { formatDate, plural } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const PAGE_SIZE = 20

export function AdminMatchesPage() {
  useDocumentTitle('Partidos · Administración')
  const [params, setParams] = useSearchParams()
  const [lastVoid, setLastVoid] = useState<MatchChangeResult | null>(null)

  const playerId = Number(params.get('playerId')) || undefined
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const status = (params.get('status') as MatchStatus | null) ?? undefined
  const withWarnings = params.get('withWarnings') === 'true'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const invalidRange = from !== '' && to !== '' && from > to

  const players = useAdminPlayers()
  const { data, isPending, isError, error, refetch } = useAdminMatches({
    playerId,
    from: from || undefined,
    to: to || undefined,
    status,
    withWarnings: withWarnings || undefined,
    page,
    pageSize: PAGE_SIZE,
  }, !invalidRange)
  const voidMatch = useVoidMatch()

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const hasFilters = Boolean(playerId || from || to || status || withWarnings)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Partidos</h1>
        <Link to="/admin/results/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-accent">
          Cargar resultado
        </Link>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="f-player" className="mb-1 block text-sm font-medium text-slate-700">Jugador</label>
          <select id="f-player" className={inputClass} value={playerId ?? ''} onChange={(e) => update({ playerId: e.target.value })}>
            <option value="">Todos</option>
            {players.data?.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
          <select id="f-status" className={inputClass} value={status ?? ''} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Todos</option>
            <option value="Valid">Válidos</option>
            <option value="Voided">Anulados</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-2">
          <div>
            <label htmlFor="f-from" className="mb-1 block text-sm font-medium text-slate-700">Desde</label>
            <input id="f-from" type="date" className={inputClass} value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div>
            <label htmlFor="f-to" className="mb-1 block text-sm font-medium text-slate-700">Hasta</label>
            <input id="f-to" type="date" className={inputClass} value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4" checked={withWarnings} onChange={(e) => update({ withWarnings: e.target.checked ? 'true' : '' })} />
          Solo partidos con advertencias
        </label>
        {hasFilters && (
          <div className="sm:col-span-2 sm:text-right">
            <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>Limpiar filtros</Button>
          </div>
        )}
      </form>

      <div className="mt-4 space-y-3">
        {lastVoid && (
          <Notice tone="success" live>
            Partido anulado y ranking recalculado.
            {lastVoid.newlyWarnedMatchIds.length > 0 && (
              <>
                {' '}
                <strong>Atención:</strong> {plural(lastVoid.newlyWarnedMatchIds.length, 'partido posterior quedó', 'partidos posteriores quedaron')} fuera
                de rango (marcados abajo).
              </>
            )}
          </Notice>
        )}
        {voidMatch.isError && <Notice tone="error" live>{describeError(voidMatch.error)}</Notice>}
        {invalidRange && <Notice tone="warning" live>La fecha “Desde” no puede ser posterior a “Hasta”.</Notice>}
        {isPending && !invalidRange && <LoadingState label="Cargando partidos…" />}
        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {data && data.items.length === 0 && <EmptyState>{hasFilters ? 'No hay partidos con esos filtros.' : 'Todavía no se cargaron partidos.'}</EmptyState>}

        {data && data.items.length > 0 && (
          <>
            <p className="text-sm text-slate-700">{plural(data.total, 'partido', 'partidos')}</p>
            <ul className="space-y-2">
              {data.items.map((m) => (
                <MatchRow
                  key={m.id}
                  match={m}
                  voiding={voidMatch.isPending}
                  onVoid={() => voidMatch.mutate(m.id, { onSuccess: setLastVoid })}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
                <Button variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>← Anterior</Button>
                <span className="text-sm text-slate-700">Página {page} de {totalPages}</span>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>Siguiente →</Button>
              </nav>
            )}
          </>
        )}
      </div>
    </>
  )
}

function MatchRow({ match, onVoid, voiding }: { match: AdminMatch; onVoid: () => void; voiding: boolean }) {
  const voided = match.status === 'Voided'
  const winnerIsChallenger = match.winner.id === match.challenger.id

  return (
    <li className={`rounded-lg border p-3 shadow-sm ${voided ? '' : 'bg-white'} ${voided ? 'border-slate-200 bg-slate-50' : match.warning ? 'border-amber-400' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="text-slate-700">{formatDate(match.playedAt)}</span>
        <span className="flex items-center gap-2">
          {voided && <span className="rounded bg-slate-200 px-2 py-0.5 text-sm font-semibold text-slate-700">Anulado</span>}
          {match.warning && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900" title={messageForCode(match.warning)}>
              Advertencia: {match.warning === 'OutOfRange' ? 'fuera de rango' : 'no se pudo aplicar'}
            </span>
          )}
          <span className="font-mono font-semibold">{match.result}</span>
        </span>
      </div>
      <p className="mt-1">
        <span className={winnerIsChallenger ? 'font-semibold' : 'text-slate-700'}>{match.challenger.fullName}</span>
        <span className="mx-2 text-sm uppercase text-slate-700">vs</span>
        <span className={!winnerIsChallenger ? 'font-semibold' : 'text-slate-700'}>{match.challenged.fullName}</span>
        <span className="sr-only"> (ganó {match.winner.fullName})</span>
      </p>
      {match.movementText && <p className="mt-1 text-sm text-slate-700">{match.movementText}</p>}
      {match.warning && <p className="mt-1 text-sm text-amber-900">{messageForCode(match.warning)}</p>}
      {match.notes && <p className="mt-1 text-sm italic text-slate-700">{match.notes}</p>}
      {!voided && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            to={`/admin/matches/${match.id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
            aria-label={`Editar partido del ${formatDate(match.playedAt)} entre ${match.challenger.fullName} y ${match.challenged.fullName}`}
          >
            Editar
          </Link>
          <ConfirmButton
            label="Anular"
            question="¿Anular este partido? El ranking se recalcula."
            confirmLabel="Sí, anular"
            disabled={voiding}
            onConfirm={onVoid}
          />
        </div>
      )}
    </li>
  )
}
