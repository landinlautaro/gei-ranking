import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { usePlayer, usePlayers } from '../api/queries'
import { clearMe, setMe, useMe } from '../lib/meStore'
import { MovementBadge } from './MovementBadge'
import { Avatar } from './Avatar'
import { inputClass } from './ui'

const cardClass = 'rounded-lg border-2 border-brand bg-white p-4 shadow-sm'

/** Home-page card: pick your name once and every visit shows your position and who you can challenge. */
export function MeCard({ onShowMe }: { onShowMe?: () => void }) {
  const meId = useMe()
  return meId === null ? <PickPlayer /> : <MyStatus playerId={meId} onShowMe={onShowMe} />
}

function PickPlayer() {
  const players = usePlayers()
  const options = players.data?.filter((p) => p.isActive && p.position !== null)

  if (!options || options.length === 0) return null

  return (
    <section aria-labelledby="me-title" className={cardClass}>
      <h2 id="me-title" className="text-xl">¿Sos jugador del ranking?</h2>
      <p className="mt-1 text-slate-700">Elegí tu nombre y cada vez que entres vas a ver tu puesto y a quién podés desafiar.</p>
      <label htmlFor="me-select" className="mt-3 block font-medium">Tu nombre</label>
      <select id="me-select" value="" onChange={(e) => e.target.value && setMe(Number(e.target.value))} className={`${inputClass} mt-1`}>
        <option value="">Elegir mi nombre…</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>{p.fullName}</option>
        ))}
      </select>
    </section>
  )
}

function MyStatus({ playerId, onShowMe }: { playerId: number; onShowMe?: () => void }) {
  const { data: player, error } = usePlayer(playerId)
  const gone = error instanceof ApiError && error.status === 404

  // The player was removed: forget the choice and offer the picker again.
  useEffect(() => {
    if (gone) clearMe()
  }, [gone])

  if (!player) return null

  return (
    <section aria-labelledby="me-title" className={cardClass}>
      <div className="flex items-center gap-3">
        <Avatar player={player} size="md" />
        <h2 id="me-title" className="text-xl">Hola, {player.nickname ?? player.fullName}</h2>
      </div>

      {player.position !== null ? (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <span className="text-lg">Tu puesto:</span>
          <span className="text-5xl font-black text-brand">{player.position}</span>
          <MovementBadge movement={player.movement} verbose />
        </p>
      ) : (
        <p className="mt-3 text-lg">Por ahora estás fuera del ranking.</p>
      )}

      <h3 className="mt-4 text-lg">Hoy podés desafiar a:</h3>
      {player.canChallenge.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {player.canChallenge.map((c) => (
            <li key={c.player.id}>
              <Link
                to={`/players/${c.player.id}`}
                className="flex min-h-12 items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg hover:bg-slate-50"
              >
                <span className="w-10 text-right font-black tabular-nums">{c.position}</span>
                <Avatar player={c.player} size="sm" />
                <span className="min-w-0 break-words">{c.player.fullName}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-slate-700">
          {player.position === 1 ? 'Sos el número uno: no hay nadie por encima para desafiar.' : 'Mientras estés fuera del ranking no podés desafiar.'}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Link to={`/players/${playerId}`} className="inline-flex min-h-12 items-center bg-brand px-5 text-sm font-medium uppercase text-white hover:bg-accent">
          Ver mi perfil completo
        </Link>
        {onShowMe && player.position !== null && (
          <button
            type="button"
            onClick={onShowMe}
            className="inline-flex min-h-12 items-center border border-brand px-5 text-sm font-medium uppercase text-brand hover:bg-slate-50"
          >
            Ver mi lugar en la tabla
          </button>
        )}
        <button type="button" onClick={clearMe} className="min-h-12 text-brand underline hover:text-accent">
          No soy {player.nickname ?? player.fullName}
        </button>
      </div>
    </section>
  )
}
