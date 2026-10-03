import { useState, type FormEvent } from 'react'
import { useAdjustPosition, useAdminPlayers } from '../../api/admin'
import type { AdjustmentResult } from '../../api/adminTypes'
import { ErrorState, LoadingState } from '../../components/PageState'
import { Button, Field, inputClass, Notice } from '../../components/ui'
import { describeError, fieldErrors } from '../../lib/errors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const MAX_REASON = 500

export function AdjustmentPage() {
  useDocumentTitle('Ajuste de posición')
  const players = useAdminPlayers()
  const adjust = useAdjustPosition()
  const [playerId, setPlayerId] = useState('')
  const [position, setPosition] = useState('')
  const [reason, setReason] = useState('')
  const [done, setDone] = useState<(AdjustmentResult & { name: string }) | null>(null)

  const ranked = (players.data ?? []).filter((p) => p.position !== null).sort((a, b) => a.position! - b.position!)
  const selected = ranked.find((p) => String(p.id) === playerId)
  const errors = fieldErrors(adjust.error)
  const ready = selected !== undefined && position !== '' && reason.trim() !== ''

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready || !selected) return
    adjust.mutate(
      { playerId: selected.id, newPosition: Number(position), reason: reason.trim() },
      {
        onSuccess: (result) => {
          setDone({ ...result, name: selected.fullName })
          setPlayerId('')
          setPosition('')
          setReason('')
        },
      },
    )
  }

  if (players.isPending) return <LoadingState label="Cargando jugadores…" />
  if (players.isError) return <ErrorState error={players.error} onRetry={() => void players.refetch()} />

  return (
    <>
      <h1 className="text-2xl font-bold">Ajuste manual de posición</h1>
      <p className="mt-1 max-w-prose text-slate-600">
        Mueve a un jugador a otra posición y los demás se corren. Queda registrado en el historial con el motivo. Usalo para correcciones, no para
        cargar resultados.
      </p>

      <form onSubmit={submit} className="mt-6 max-w-xl space-y-4" noValidate>
        {done && (
          <Notice tone="success" live>
            {done.name} pasó del #{done.fromPosition} al #{done.toPosition}. El ranking ya está actualizado.
          </Notice>
        )}
        {adjust.isError && !Object.keys(errors).length && <Notice tone="error" live>{describeError(adjust.error)}</Notice>}

        <Field label="Jugador" error={errors.playerId}>
          <select className={inputClass} value={playerId} onChange={(e) => { setPlayerId(e.target.value); setDone(null) }}>
            <option value="">Elegí un jugador…</option>
            {ranked.map((p) => <option key={p.id} value={p.id}>#{p.position} · {p.fullName}</option>)}
          </select>
        </Field>
        <Field
          label="Nueva posición"
          hint={selected ? `Hoy está en el #${selected.position}. Posiciones válidas: 1 a ${ranked.length}.` : undefined}
          error={errors.newPosition}
        >
          <input type="number" min={1} max={ranked.length} inputMode="numeric" className={inputClass} value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
        <Field label="Motivo (obligatorio)" error={errors.reason} hint={`${reason.length} de ${MAX_REASON} caracteres.`}>
          <textarea className={inputClass} rows={3} maxLength={MAX_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button type="submit" disabled={!ready || adjust.isPending}>{adjust.isPending ? 'Guardando…' : 'Aplicar ajuste'}</Button>
      </form>
    </>
  )
}
