import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAdminPlayers, useCreateMatch, useMatchPreview, useUpdateMatch } from '../../api/admin'
import type { AdminMatch, MatchChangeResult } from '../../api/adminTypes'
import type { Completion } from '../../api/types'
import { CHALLENGE_RANGE } from '../../lib/challenge'
import { describeError, fieldErrors } from '../../lib/errors'
import { isSevenSix, isValidSet, parseCount } from '../../lib/score'
import { plural } from '../../lib/format'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { ErrorState, LoadingState } from '../PageState'
import { Button, Field, inputClass, Notice } from '../ui'
import { emptyState, needsSuperTieBreak, stateFromMatch, toInput, type FormState, type SetFields } from './matchFormModel'
import { MatchPreviewPanel } from './MatchPreviewPanel'

const PREVIEW_DELAY_MS = 350

const completions: { value: Completion; label: string }[] = [
  { value: 'Normal', label: 'Partido jugado' },
  { value: 'Walkover', label: 'W.O.' },
  { value: 'Retirement', label: 'Abandono' },
]

interface MatchFormProps {
  /** Present when editing: the form starts from this match and saves with PUT. */
  match?: AdminMatch
}

export function MatchForm({ match }: MatchFormProps) {
  const editing = match !== undefined
  const players = useAdminPlayers()
  const [state, setState] = useState<FormState>(() => (match ? stateFromMatch(match) : emptyState()))
  const [saved, setSaved] = useState<MatchChangeResult | null>(null)

  const create = useCreateMatch()
  const update = useUpdateMatch(match?.id ?? 0)
  const mutation = editing ? update : create

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((s) => ({ ...s, [key]: value, ...(key === 'confirmOutOfRange' ? {} : { confirmOutOfRange: false }) }))
  const setField = (which: 'set1' | 'set2', field: keyof SetFields, value: string) =>
    setState((s) => ({ ...s, [which]: { ...s[which], [field]: value }, confirmOutOfRange: false }))

  // Ranked players, plus the match's own players when editing (one may have left the ranking since).
  const options = useMemo(() => {
    const list = (players.data ?? []).filter((p) => p.position !== null).sort((a, b) => a.position! - b.position!)
    const extra = match
      ? [match.challenger, match.challenged].filter((p) => !list.some((l) => l.id === p.id))
      : []
    return { ranked: list, extra }
  }, [players.data, match])

  const byId = useMemo(() => {
    const map = new Map<number, { name: string; position: number | null }>()
    for (const p of players.data ?? []) map.set(p.id, { name: p.fullName, position: p.position })
    return map
  }, [players.data])

  const currentInput = toInput(state, match?.playedAt)
  // Preview ignores the confirmation checkbox: it is the answer to the preview, not an input to it.
  const previewInput = useDebouncedValue(currentInput, PREVIEW_DELAY_MS)
  const preview = useMatchPreview(previewInput, match?.id ?? null)

  const settled = JSON.stringify(currentInput) === JSON.stringify(previewInput) && !preview.isFetching
  const previewData = currentInput ? preview.data : undefined
  const canSave =
    currentInput !== null &&
    settled &&
    previewData?.isValid === true &&
    (!previewData.requiresOutOfRangeConfirmation || state.confirmOutOfRange) &&
    !mutation.isPending

  const challengerPos = byId.get(Number(state.challengerId))?.position ?? null
  const challengerName = byId.get(Number(state.challengerId))?.name ?? 'Desafiante'
  const challengedName = byId.get(Number(state.challengedId))?.name ?? 'Desafiado'
  const showStb = state.completion === 'Normal' ? needsSuperTieBreak(state) : state.completion === 'Retirement'
  const winnerName = previewData?.winnerId ? (byId.get(previewData.winnerId)?.name ?? null) : null
  const serverErrors = fieldErrors(mutation.error)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const input = toInput(state, match?.playedAt, state.confirmOutOfRange)
    if (!input || !canSave) return
    mutation.mutate(input, { onSuccess: (result) => setSaved(result) })
  }

  if (players.isPending) return <LoadingState label="Cargando jugadores…" />
  if (players.isError) return <ErrorState error={players.error} onRetry={() => void players.refetch()} />

  if (saved) {
    return <SavedPanel result={saved} editing={editing} onAnother={() => { setSaved(null); setState({ ...emptyState(), date: state.date }); create.reset() }} />
  }

  const playerOption = (id: number, name: string, position: number | null) => (
    <option key={id} value={id}>
      {position !== null ? `#${position} · ${name}` : `${name} (fuera del ranking)`}
    </option>
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
            {options.ranked.map((p) => playerOption(p.id, p.fullName, p.position))}
            {options.extra.map((p) => playerOption(p.id, p.fullName, null))}
          </select>
        </Field>
        <Field label="Desafiado" error={serverErrors.challengedId} hint={challengedHint}>
          <select className={inputClass} value={state.challengedId} onChange={(e) => set('challengedId', e.target.value)}>
            <option value="">Elegí un jugador…</option>
            {options.ranked.filter((p) => String(p.id) !== state.challengerId).map((p) => playerOption(p.id, p.fullName, p.position))}
            {options.extra.filter((p) => String(p.id) !== state.challengerId).map((p) => playerOption(p.id, p.fullName, null))}
          </select>
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha del partido" error={serverErrors.playedAt}>
          <input type="date" className={inputClass} value={state.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Cómo terminó</legend>
          <div className="flex flex-wrap gap-2">
            {completions.map((c) => (
              <label
                key={c.value}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                  state.completion === c.value ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="completion"
                  className="sr-only"
                  value={c.value}
                  checked={state.completion === c.value}
                  onChange={() => set('completion', c.value)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {state.completion !== 'Walkover' && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">{state.completion === 'Retirement' ? 'Resultado parcial' : 'Resultado'}</legend>
          <div className="grid grid-cols-[4.5rem_1fr_1fr] items-center gap-x-3 gap-y-2 text-sm">
            <span />
            <span className="truncate font-medium text-slate-700">{challengerName}</span>
            <span className="truncate font-medium text-slate-700">{challengedName}</span>
            <SetRow label="Set 1" value={state.set1} onChange={(f, v) => setField('set1', f, v)} partial={state.completion === 'Retirement'} />
            <SetRow label="Set 2" value={state.set2} onChange={(f, v) => setField('set2', f, v)} partial={state.completion === 'Retirement'} />
            {showStb && (
              <>
                <span className="font-medium text-slate-700">Super TB</span>
                <ScoreInput label="Super Tie-Break del desafiante" value={state.stbC} onChange={(v) => set('stbC', v)} max={30} />
                <ScoreInput label="Super Tie-Break del desafiado" value={state.stbD} onChange={(v) => set('stbD', v)} max={30} />
              </>
            )}
          </div>
          <p className="text-sm text-slate-700">
            Games por set: 6-0 a 6-4, 7-5 o 7-6 (con tie-break opcional). Si cada uno gana un set, el tercero es un Super Tie-Break a 10.
          </p>
          {serverErrors.score && <p className="text-sm text-red-700">{serverErrors.score}</p>}
        </fieldset>
      )}

      {state.completion !== 'Normal' && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">¿Quién ganó?</legend>
          <div className="flex flex-wrap gap-2">
            {(['Challenger', 'Challenged'] as const).map((side) => (
              <label
                key={side}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                  state.winner === side ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="winner"
                  className="sr-only"
                  checked={state.winner === side}
                  onChange={() => set('winner', side)}
                />
                {side === 'Challenger' ? challengerName : challengedName}
              </label>
            ))}
          </div>
          {serverErrors.winner && <p className="mt-1 text-sm text-red-700">{serverErrors.winner}</p>}
        </fieldset>
      )}

      <Field label="Observaciones (opcional)" error={serverErrors.notes}>
        <textarea className={inputClass} rows={2} maxLength={1000} value={state.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <MatchPreviewPanel
        preview={previewData}
        loading={preview.isFetching}
        failed={preview.isError && currentInput !== null}
        winnerName={winnerName}
      />

      {previewData?.requiresOutOfRangeConfirmation && (
        <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={state.confirmOutOfRange}
            onChange={(e) => set('confirmOutOfRange', e.target.checked)}
          />
          <span>Entiendo que este desafío está fuera de rango y quiero guardarlo igual.</span>
        </label>
      )}

      {mutation.isError && <Notice tone="error" live>{describeError(mutation.error)}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!canSave}>
          {mutation.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar resultado'}
        </Button>
        {editing && <Link to="/admin/matches" className="text-sm text-brand hover:text-accent underline">Cancelar</Link>}
      </div>
    </form>
  )
}

function ScoreInput({ label, value, onChange, max = 7, invalid }: { label: string; value: string; onChange: (v: string) => void; max?: number; invalid?: boolean }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={`${inputClass} text-center tabular-nums`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function SetRow({ label, value, onChange, partial }: { label: string; value: SetFields; onChange: (field: keyof SetFields, value: string) => void; partial: boolean }) {
  const c = parseCount(value.c)
  const d = parseCount(value.d)
  const complete = c !== null && d !== null
  const invalid = !partial && complete && !isValidSet(c, d)
  const showTieBreak = complete && isSevenSix(c, d)

  return (
    <>
      <span className="font-medium text-slate-700">{label}</span>
      <ScoreInput label={`${label}: games del desafiante`} value={value.c} onChange={(v) => onChange('c', v)} invalid={invalid} />
      <ScoreInput label={`${label}: games del desafiado`} value={value.d} onChange={(v) => onChange('d', v)} invalid={invalid} />
      {invalid && (
        <p role="alert" className="col-span-3 text-sm text-red-700">
          {label}: {c}-{d} no es un resultado válido (6-0 a 6-4, 7-5 o 7-6).
        </p>
      )}
      {showTieBreak && (
        <>
          <span className="text-slate-700">Tie-break</span>
          <ScoreInput label={`${label}: tie-break del desafiante`} value={value.tbC} onChange={(v) => onChange('tbC', v)} max={30} />
          <ScoreInput label={`${label}: tie-break del desafiado`} value={value.tbD} onChange={(v) => onChange('tbD', v)} max={30} />
        </>
      )}
    </>
  )
}

function SavedPanel({ result, editing, onAnother }: { result: MatchChangeResult; editing: boolean; onAnother: () => void }) {
  const { match, newlyWarnedMatchIds } = result
  return (
    <div className="space-y-4">
      <Notice tone="success" live>
        <p className="font-semibold">{editing ? 'Cambios guardados.' : 'Resultado guardado.'} El ranking ya está actualizado.</p>
        <p className="mt-1">
          {match.challenger.fullName} vs {match.challenged.fullName}: <span className="font-mono">{match.result}</span>
        </p>
        {match.movementText && <p className="mt-1">{match.movementText}</p>}
      </Notice>
      {newlyWarnedMatchIds.length > 0 && (
        <Notice tone="warning" live>
          <strong>Atención:</strong> {plural(newlyWarnedMatchIds.length, 'partido posterior quedó', 'partidos posteriores quedaron')} fuera de rango por
          este cambio. Revisalos en{' '}
          <Link to="/admin/matches?withWarnings=true" className="underline">Partidos con advertencias</Link>.
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        {!editing && <Button onClick={onAnother}>Cargar otro resultado</Button>}
        <Link to="/admin/matches" className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100">
          Ver partidos
        </Link>
        <Link to="/" className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100">
          Ver ranking público
        </Link>
      </div>
    </div>
  )
}
