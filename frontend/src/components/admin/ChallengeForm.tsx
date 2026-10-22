import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAdminPlayers, useChallengePreview, useCreateChallenge } from '../../api/admin'
import type { AdminChallenge, ChallengeInput, ChallengePreview } from '../../api/adminTypes'
import { CHALLENGE_RANGE } from '../../lib/challenge'
import { describeError, fieldErrors, messageForCode } from '../../lib/errors'
import { clubDateTimeIso, clubNoonIso, formatDayMonth, todayClubDate } from '../../lib/format'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { challengeMessage } from '../../lib/whatsapp'
import { CopyButton } from '../CopyButton'
import { ErrorState, LoadingState } from '../PageState'
import { Button, Field, inputClass, Notice, buttonClass } from '../ui'

const PREVIEW_DELAY_MS = 350

interface FormState {
  challengerId: string
  challengedId: string
  date: string
  scheduledAt: string
  notes: string
  confirmWarnings: boolean
}

const emptyState = (): FormState => ({ challengerId: '', challengedId: '', date: todayClubDate(), scheduledAt: '', notes: '', confirmWarnings: false })

function toInput(state: FormState, confirmWarnings = false): ChallengeInput | null {
  const challengerId = Number(state.challengerId)
  const challengedId = Number(state.challengedId)
  if (!challengerId || !challengedId || !state.date) return null
  return {
    challengerId,
    challengedId,
    issuedAt: clubNoonIso(state.date),
    scheduledAt: state.scheduledAt ? clubDateTimeIso(state.scheduledAt) : null,
    notes: state.notes.trim() || null,
    confirmWarnings,
  }
}

const fieldNames: Record<string, string> = {
  challengerId: 'Desafiante',
  challengedId: 'Desafiado',
  issuedAt: 'Fecha',
  scheduledAt: 'Fecha acordada',
  notes: 'Observaciones',
}

export function ChallengeForm() {
  const players = useAdminPlayers()
  const [state, setState] = useState<FormState>(emptyState)
  const [saved, setSaved] = useState<AdminChallenge | null>(null)
  const create = useCreateChallenge()

  // Any change to the data invalidates the confirmation given to the previous warnings.
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value, ...(key === 'confirmWarnings' ? {} : { confirmWarnings: false }) }))

  const ranked = useMemo(() => (players.data ?? []).filter((p) => p.position !== null).sort((a, b) => a.position! - b.position!), [players.data])
  const challengerPos = ranked.find((p) => String(p.id) === state.challengerId)?.position ?? null

  const currentInput = toInput(state)
  const previewInput = useDebouncedValue(currentInput, PREVIEW_DELAY_MS)
  const preview = useChallengePreview(previewInput)
  const previewData = currentInput ? preview.data : undefined
  const settled = JSON.stringify(currentInput) === JSON.stringify(previewInput) && !preview.isFetching
  const hasWarnings = (previewData?.warnings.length ?? 0) > 0
  const canSave = currentInput !== null && settled && previewData?.isValid === true && (!hasWarnings || state.confirmWarnings) && !create.isPending
  const serverErrors = fieldErrors(create.error)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = toInput(state, state.confirmWarnings)
    if (!input || !canSave) return
    create.mutate(input, { onSuccess: setSaved })
  }

  if (players.isPending) return <LoadingState label="Cargando jugadores…" />
  if (players.isError) return <ErrorState error={players.error} onRetry={() => void players.refetch()} />

  if (saved) {
    return (
      <div className="space-y-4">
        <Notice tone="success" live>
          <p className="font-semibold">Desafío registrado.</p>
          <p className="mt-1">
            {saved.challenger.fullName} desafía a {saved.challenged.fullName}. Vence el {formatDayMonth(saved.deadlineAt)}.
          </p>
        </Notice>
        <CopyButton label="Copiar para WhatsApp" variant="secondary" getText={() => challengeMessage(saved)} />
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => { setSaved(null); setState(emptyState()); create.reset() }}>Registrar otro desafío</Button>
          <Link to="/admin/challenges" className={buttonClass('secondary')}>Ver desafíos</Link>
        </div>
      </div>
    )
  }

  const option = (id: number, name: string, position: number | null) => (
    <option key={id} value={id}>{position !== null ? `#${position} · ${name}` : name}</option>
  )
  const challengedHint =
    challengerPos !== null
      ? `Puede desafiar del #${Math.max(1, challengerPos - CHALLENGE_RANGE)} al #${challengerPos - 1}.`
      : 'Elegí primero al desafiante.'

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Jugadores</legend>
        <Field label="Desafiante" error={serverErrors.challengerId}>
          <select className={inputClass} value={state.challengerId} onChange={(e) => set('challengerId', e.target.value)}>
            <option value="">Elegí un jugador…</option>
            {ranked.map((p) => option(p.id, p.fullName, p.position))}
          </select>
        </Field>
        <Field label="Desafiado" error={serverErrors.challengedId} hint={challengedHint}>
          <select className={inputClass} value={state.challengedId} onChange={(e) => set('challengedId', e.target.value)}>
            <option value="">Elegí un jugador…</option>
            {ranked.filter((p) => String(p.id) !== state.challengerId).map((p) => option(p.id, p.fullName, p.position))}
          </select>
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha del desafío" error={serverErrors.issuedAt}>
          <input type="date" className={inputClass} value={state.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Día y hora acordados (opcional)" error={serverErrors.scheduledAt}>
          <input type="datetime-local" className={inputClass} value={state.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
        </Field>
      </div>

      <Field label="Observaciones (opcional)" error={serverErrors.notes}>
        <textarea className={inputClass} rows={2} maxLength={1000} value={state.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <PreviewPanel preview={previewData} loading={preview.isFetching} failed={preview.isError && currentInput !== null} />

      {hasWarnings && (
        <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-0.5 size-4" checked={state.confirmWarnings} onChange={(e) => set('confirmWarnings', e.target.checked)} />
          <span>Entiendo las advertencias y quiero registrar el desafío igual.</span>
        </label>
      )}

      {create.isError && <Notice tone="error" live>{describeError(create.error)}</Notice>}

      <Button type="submit" disabled={!canSave}>{create.isPending ? 'Guardando…' : 'Registrar desafío'}</Button>
    </form>
  )
}

function PreviewPanel({ preview, loading, failed }: { preview: ChallengePreview | undefined; loading: boolean; failed: boolean }) {
  if (failed) return <Notice tone="error" live>No se pudo calcular la vista previa. Revisá la conexión.</Notice>
  if (!preview) return <Notice>Elegí desafiante y desafiado para ver el plazo y las advertencias.</Notice>

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
              {errors.map((e) => <li key={e.key}>{e.text}</li>)}
            </ul>
          </Notice>
        )}
        {preview.isValid && preview.deadlineAt && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
            <p className="font-semibold">Vence el {formatDayMonth(preview.deadlineAt)}</p>
            <p className="mt-1 text-sm">Desafiante: #{preview.challengerPosition} · Desafiado: #{preview.challengedPosition}</p>
          </div>
        )}
        {preview.warnings.map((warning) => (
          <Notice key={warning} tone="warning"><strong>Advertencia:</strong> {messageForCode(warning)}</Notice>
        ))}
      </div>
    </section>
  )
}
