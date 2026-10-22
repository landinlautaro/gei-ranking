import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAdminChallenges, useAdminPlayers, useCancelChallenge, useUpdateChallenge } from '../../api/admin'
import type { AdminChallenge, ChallengeFilter } from '../../api/adminTypes'
import { ChallengeForm } from '../../components/admin/ChallengeForm'
import { CopyButton } from '../../components/CopyButton'
import { EmptyState, ErrorState, LoadingState } from '../../components/PageState'
import { Button, ConfirmButton, Field, Notice, buttonClass, inputClass } from '../../components/ui'
import { challengeDeadline } from '../../lib/challenge'
import { describeError } from '../../lib/errors'
import { clubDateInput, clubDateTimeInput, clubDateTimeIso, clubEndOfDayIso, formatDayMonthTime, plural } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { challengeMessage } from '../../lib/whatsapp'

const PAGE_SIZE = 20

const filterLabels: Record<ChallengeFilter | 'All', string> = {
  Active: 'Abiertos',
  Expired: 'Vencidos',
  Pending: 'Sin coordinar',
  Scheduled: 'Coordinados',
  Played: 'Jugados',
  Cancelled: 'Cancelados',
  All: 'Todos',
}

export function NewChallengePage() {
  useDocumentTitle('Nuevo desafío · Administración')
  return (
    <>
      <Link to="/admin/challenges" className="text-sm text-brand hover:text-accent underline">← Desafíos</Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold">Registrar desafío</h1>
      <ChallengeForm />
    </>
  )
}

export function AdminChallengesPage() {
  useDocumentTitle('Desafíos · Administración')
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as ChallengeFilter | 'All' | null) ?? 'Active'
  const playerId = Number(params.get('playerId')) || undefined
  const page = Math.max(1, Number(params.get('page')) || 1)

  const players = useAdminPlayers()
  const { data, isPending, isError, error, refetch } = useAdminChallenges({
    status: status === 'All' ? undefined : status,
    playerId,
    page,
    pageSize: PAGE_SIZE,
  })
  const cancel = useCancelChallenge()

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Desafíos</h1>
        <Link to="/admin/challenges/new" className={buttonClass('primary')}>Registrar desafío</Link>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
          <select id="f-status" className={inputClass} value={status} onChange={(e) => update({ status: e.target.value === 'Active' ? '' : e.target.value })}>
            {Object.entries(filterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-player" className="mb-1 block text-sm font-medium text-slate-700">Jugador</label>
          <select id="f-player" className={inputClass} value={playerId ?? ''} onChange={(e) => update({ playerId: e.target.value })}>
            <option value="">Todos</option>
            {players.data?.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </div>
      </form>

      <div className="mt-4 space-y-3">
        {cancel.isSuccess && <Notice tone="success" live>Desafío cancelado.</Notice>}
        {cancel.isError && <Notice tone="error" live>{describeError(cancel.error)}</Notice>}
        {isPending && <LoadingState label="Cargando desafíos…" />}
        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {data && data.items.length === 0 && <EmptyState>No hay desafíos con esos filtros.</EmptyState>}

        {data && data.items.length > 0 && (
          <>
            <p className="text-sm text-slate-700">{plural(data.total, 'desafío', 'desafíos')}</p>
            <ul className="space-y-2">
              {data.items.map((c) => (
                <ChallengeRow key={c.id} challenge={c} cancelling={cancel.isPending} onCancel={() => cancel.mutate(c.id)} />
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

function ChallengeRow({ challenge, onCancel, cancelling }: { challenge: AdminChallenge; onCancel: () => void; cancelling: boolean }) {
  const [editing, setEditing] = useState(false)
  const active = challenge.status === 'Pending' || challenge.status === 'Scheduled'
  const deadline = challengeDeadline(challenge.deadlineAt)
  const names = `${challenge.challenger.fullName} y ${challenge.challenged.fullName}`
  const position = (p: number | null) => (p === null ? '' : `#${p} `)

  return (
    <li className={`rounded-lg border p-3 shadow-sm ${active ? 'bg-white' : 'bg-slate-50'} ${challenge.isExpired ? 'border-red-300' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {active && (
          <span className={`rounded px-2 py-0.5 font-semibold ${deadline.state === 'expired' ? 'bg-red-100 text-red-800' : deadline.state === 'today' ? 'bg-amber-100 text-amber-900' : 'bg-sky-50 text-brand-dark'}`}>
            {deadline.label}
          </span>
        )}
        {challenge.status === 'Played' && <span className="rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">Jugado</span>}
        {challenge.status === 'Cancelled' && <span className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">Cancelado</span>}
        {active && challenge.scheduledAt && (
          <span className="rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">Coordinado: {formatDayMonthTime(challenge.scheduledAt)}</span>
        )}
      </div>

      <p className="mt-2">
        <span className="font-semibold">{position(challenge.challengerPosition)}{challenge.challenger.fullName}</span>
        <span className="mx-2 text-sm uppercase text-slate-700">desafía a</span>
        <span className="font-semibold">{position(challenge.challengedPosition)}{challenge.challenged.fullName}</span>
      </p>
      {challenge.notes && <p className="mt-1 whitespace-pre-line text-sm italic text-slate-700">{challenge.notes}</p>}
      {challenge.isExpired && (
        <p className="mt-1 text-sm text-red-800">Pasó el plazo: cargá el resultado (por ejemplo un W.O.), extendé el plazo o cancelalo.</p>
      )}

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link to={`/admin/results/new?challengeId=${challenge.id}`} className={buttonClass('primary')} aria-label={`Cargar resultado de ${names}`}>
            Cargar resultado
          </Link>
          <Button variant="secondary" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cerrar' : 'Coordinar o editar'}
          </Button>
          <CopyButton label="Copiar mensaje" variant="secondary" getText={() => challengeMessage(challenge)} />
          <ConfirmButton
            label="Cancelar desafío"
            question="¿Cancelar este desafío? Queda en el historial."
            confirmLabel="Sí, cancelar"
            variant="danger"
            disabled={cancelling}
            onConfirm={onCancel}
          />
        </div>
      )}
      {active && editing && <ChallengeEditor challenge={challenge} onDone={() => setEditing(false)} />}
    </li>
  )
}

/** Agreed date and time, deadline and notes of an open challenge. Unchanged values are sent back as they were. */
function ChallengeEditor({ challenge, onDone }: { challenge: AdminChallenge; onDone: () => void }) {
  const mutation = useUpdateChallenge(challenge.id)
  const [scheduledAt, setScheduledAt] = useState(challenge.scheduledAt ? clubDateTimeInput(challenge.scheduledAt) : '')
  const [deadlineDate, setDeadlineDate] = useState(clubDateInput(challenge.deadlineAt))
  const [notes, setNotes] = useState(challenge.notes ?? '')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const originalScheduled = challenge.scheduledAt ? clubDateTimeInput(challenge.scheduledAt) : ''
    mutation.mutate(
      {
        issuedAt: challenge.issuedAt,
        deadlineAt: deadlineDate === clubDateInput(challenge.deadlineAt) ? challenge.deadlineAt : clubEndOfDayIso(deadlineDate),
        scheduledAt: scheduledAt === originalScheduled ? challenge.scheduledAt : scheduledAt ? clubDateTimeIso(scheduledAt) : null,
        notes: notes.trim() || null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
      <Field label="Día y hora acordados">
        <input type="datetime-local" className={inputClass} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </Field>
      <Field label="Vence el" hint="Se puede extender si los jugadores no llegaron a jugar.">
        <input type="date" className={inputClass} value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Observaciones">
          <textarea className={inputClass} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {mutation.isError && <div className="sm:col-span-2"><Notice tone="error" live>{describeError(mutation.error)}</Notice></div>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={mutation.isPending || !deadlineDate}>{mutation.isPending ? 'Guardando…' : 'Guardar cambios'}</Button>
      </div>
    </form>
  )
}
