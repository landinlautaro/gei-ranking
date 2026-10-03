import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useAdminPlayer,
  useAdminPlayers,
  useCreatePlayer,
  useDeactivatePlayer,
  useDeletePhoto,
  useReactivatePlayer,
  useUpdatePlayer,
  useUploadPhoto,
} from '../../api/admin'
import type { AdminPlayer, PlayerInput } from '../../api/adminTypes'
import { Avatar } from '../../components/Avatar'
import { EmptyState, ErrorState, LoadingState } from '../../components/PageState'
import { Button, ConfirmButton, Field, inputClass, Notice } from '../../components/ui'
import { describeError, fieldErrors } from '../../lib/errors'
import { backhandLabel, clubDateInput, clubNoonIso, formatDate, handLabel, normalizeText, todayClubDate } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

// ---------------------------------------------------------------- list

export function AdminPlayersPage() {
  useDocumentTitle('Jugadores · Administración')
  const { data, isPending, isError, error, refetch } = useAdminPlayers()
  const [search, setSearch] = useState('')

  const term = normalizeText(search.trim())
  const rows = (data ?? [])
    .filter((p) => !term || normalizeText(`${p.fullName} ${p.nickname ?? ''}`).includes(term))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.fullName.localeCompare(b.fullName))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Jugadores</h1>
        <Link to="/admin/players/new" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Nuevo jugador
        </Link>
      </div>
      <div className="mt-4 sm:w-72">
        <label htmlFor="player-search" className="sr-only">Buscar jugador</label>
        <input id="player-search" type="search" className={inputClass} placeholder="Buscar jugador…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="mt-4">
        {isPending && <LoadingState label="Cargando jugadores…" />}
        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {data && rows.length === 0 && <EmptyState>{search ? `Ningún jugador coincide con “${search}”.` : 'Todavía no hay jugadores.'}</EmptyState>}
        {rows.length > 0 && (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {rows.map((p) => (
              <li key={p.id}>
                <Link to={`/admin/players/${p.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
                  <span className="w-8 text-right font-bold tabular-nums">{p.position ?? '—'}</span>
                  <Avatar player={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.fullName}</span>
                    {p.nickname && <span className="block truncate text-xs text-slate-500">“{p.nickname}”</span>}
                  </span>
                  {!p.isActive && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Inactivo</span>}
                  <span className="text-sm text-sky-700">Editar</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- create / edit

export function NewPlayerPage() {
  useDocumentTitle('Nuevo jugador')
  const navigate = useNavigate()
  const create = useCreatePlayer()
  const [position, setPosition] = useState('')

  return (
    <>
      <Link to="/admin/players" className="text-sm text-sky-700 underline">← Jugadores</Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold">Nuevo jugador</h1>
      <PlayerForm
        submitLabel="Crear jugador"
        pending={create.isPending}
        error={create.error}
        initial={null}
        extra={
          <Field label="Posición inicial (opcional)" hint="Si lo dejás vacío entra en el último puesto." error={fieldErrors(create.error).position}>
            <input type="number" min={1} inputMode="numeric" className={inputClass} value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
        }
        onSubmit={(input) =>
          create.mutate({ ...input, position: position ? Number(position) : null }, { onSuccess: (p) => navigate(`/admin/players/${p.id}`, { replace: true }) })
        }
      />
    </>
  )
}

export function EditPlayerPage() {
  const id = Number(useParams().id)
  const valid = Number.isInteger(id) && id > 0
  const { data, isPending, isError, error, refetch } = useAdminPlayer(valid ? id : null)
  useDocumentTitle(data?.fullName)

  return (
    <>
      <Link to="/admin/players" className="text-sm text-sky-700 underline">← Jugadores</Link>
      {!valid && <ErrorState error={new Error('Jugador inválido.')} />}
      {valid && isPending && <LoadingState label="Cargando jugador…" />}
      {valid && isError && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data && <EditPlayer player={data} />}
    </>
  )
}

function EditPlayer({ player }: { player: AdminPlayer }) {
  const update = useUpdatePlayer(player.id)
  const [saved, setSaved] = useState(false)

  return (
    <div className="space-y-8">
      <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-bold">
        {player.fullName}
        {!player.isActive && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Inactivo</span>}
      </h1>
      <p className="-mt-6 text-slate-600">
        {player.position !== null ? `Puesto #${player.position}` : 'Fuera del ranking'} · En el club desde {formatDate(player.joinedAt)}
      </p>

      <section aria-labelledby="data-title" className="space-y-3">
        <h2 id="data-title" className="text-lg font-semibold">Datos</h2>
        {saved && <Notice tone="success" live>Datos guardados.</Notice>}
        <PlayerForm
          key={`${player.fullName}-${player.nickname}-${player.hand}-${player.backhand}-${player.joinedAt}`}
          submitLabel="Guardar datos"
          pending={update.isPending}
          error={update.error}
          initial={player}
          onSubmit={(input) => {
            setSaved(false)
            update.mutate(input, { onSuccess: () => setSaved(true) })
          }}
        />
      </section>

      <PhotoSection player={player} />
      <StatusSection player={player} />
    </div>
  )
}

interface PlayerFormProps {
  initial: AdminPlayer | null
  submitLabel: string
  pending: boolean
  error: unknown
  extra?: React.ReactNode
  onSubmit: (input: PlayerInput) => void
}

function PlayerForm({ initial, submitLabel, pending, error, extra, onSubmit }: PlayerFormProps) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [hand, setHand] = useState(initial?.hand ?? '')
  const [backhand, setBackhand] = useState(initial?.backhand ?? '')
  const [joined, setJoined] = useState(initial ? clubDateInput(initial.joinedAt) : todayClubDate())
  const errors = fieldErrors(error)
  const nameMissing = fullName.trim() === ''

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (nameMissing) return
    onSubmit({
      fullName: fullName.trim(),
      nickname: nickname.trim() || null,
      hand: (hand || null) as PlayerInput['hand'],
      backhand: (backhand || null) as PlayerInput['backhand'],
      // Keep the stored instant when the date was not touched.
      joinedAt: initial && clubDateInput(initial.joinedAt) === joined ? initial.joinedAt : joined ? clubNoonIso(joined) : null,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {Boolean(error) && !Object.keys(errors).length && <Notice tone="error" live>{describeError(error)}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" error={errors.fullName}>
          <input className={inputClass} value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Apodo (opcional)" error={errors.nickname}>
          <input className={inputClass} value={nickname} maxLength={60} onChange={(e) => setNickname(e.target.value)} />
        </Field>
        <Field label="Mano hábil (opcional)">
          <select className={inputClass} value={hand} onChange={(e) => setHand(e.target.value as typeof hand)}>
            <option value="">Sin dato</option>
            {Object.entries(handLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Revés (opcional)">
          <select className={inputClass} value={backhand} onChange={(e) => setBackhand(e.target.value as typeof backhand)}>
            <option value="">Sin dato</option>
            {Object.entries(backhandLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Fecha de ingreso">
          <input type="date" className={inputClass} value={joined} max={todayClubDate()} onChange={(e) => setJoined(e.target.value)} />
        </Field>
        {extra}
      </div>
      <Button type="submit" disabled={pending || nameMissing}>{pending ? 'Guardando…' : submitLabel}</Button>
    </form>
  )
}

function PhotoSection({ player }: { player: AdminPlayer }) {
  const upload = useUploadPhoto(player.id)
  const remove = useDeletePhoto(player.id)
  const [inputKey, setInputKey] = useState(0)
  const error = upload.error ?? remove.error

  return (
    <section aria-labelledby="photo-title" className="space-y-3">
      <h2 id="photo-title" className="text-lg font-semibold">Foto</h2>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar player={player} size="lg" />
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            {player.photoPath ? 'Foto subida.' : 'Sin foto: se muestra un avatar generado.'} Formatos JPEG, PNG o WebP, hasta 5 MB; se recorta a un cuadrado.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Field label={player.photoPath ? 'Reemplazar foto' : 'Subir foto'}>
              <input
                key={inputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) upload.mutate(file, { onSettled: () => setInputKey((k) => k + 1) })
                }}
              />
            </Field>
            {player.photoPath && (
              <ConfirmButton label="Quitar foto" question="¿Quitar la foto?" confirmLabel="Sí, quitar" disabled={remove.isPending} onConfirm={() => remove.mutate()} />
            )}
          </div>
          {upload.isPending && <p role="status" className="text-sm text-slate-600">Subiendo…</p>}
          {Boolean(error) && <Notice tone="error" live>{describeError(error)}</Notice>}
        </div>
      </div>
    </section>
  )
}

function StatusSection({ player }: { player: AdminPlayer }) {
  const deactivate = useDeactivatePlayer(player.id)
  const reactivate = useReactivatePlayer(player.id)
  const [position, setPosition] = useState('')
  const error = deactivate.error ?? reactivate.error

  return (
    <section aria-labelledby="status-title" className="space-y-3">
      <h2 id="status-title" className="text-lg font-semibold">Estado en el club</h2>
      {Boolean(error) && <Notice tone="error" live>{describeError(error)}</Notice>}
      {player.isActive ? (
        <>
          <p className="text-sm text-slate-600">
            Dar de baja lo saca del ranking y todos los que están abajo suben un puesto. Su historial se conserva.
          </p>
          <ConfirmButton
            label="Dar de baja"
            question={`¿Dar de baja a ${player.fullName}?`}
            confirmLabel="Sí, dar de baja"
            variant="danger"
            disabled={deactivate.isPending}
            onConfirm={() => deactivate.mutate()}
          />
        </>
      ) : (
        <div className="max-w-xs space-y-3">
          <p className="text-sm text-slate-600">Está dado de baja. Podés volver a ingresarlo al ranking.</p>
          <Field label="Posición (opcional)" hint="Vacío: entra en el último puesto.">
            <input type="number" min={1} inputMode="numeric" className={inputClass} value={position} onChange={(e) => setPosition(e.target.value)} />
          </Field>
          <Button disabled={reactivate.isPending} onClick={() => reactivate.mutate(position ? Number(position) : null)}>
            Reingresar al ranking
          </Button>
        </div>
      )}
    </section>
  )
}
