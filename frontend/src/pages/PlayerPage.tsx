import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useMatches, usePlayer } from '../api/queries'
import { Avatar } from '../components/Avatar'
import { MatchCard } from '../components/MatchCard'
import { MovementBadge } from '../components/MovementBadge'
import { ErrorState, LoadingState } from '../components/PageState'
import { PositionChart } from '../components/PositionChart'
import { backhandLabel, formatDate, handLabel, percentage, streakDescription } from '../lib/format'
import { useDocumentTitle } from '../lib/useDocumentTitle'

const RECENT_MATCHES = 10

export function PlayerPage() {
  const id = Number(useParams().id)
  const { data: player, isPending, isError, error, refetch } = usePlayer(id)
  const matches = useMatches({ playerId: id, pageSize: RECENT_MATCHES }, Number.isInteger(id) && id > 0)
  useDocumentTitle(player?.fullName)

  if (isPending && Number.isInteger(id) && id > 0) return <LoadingState label="Cargando perfil…" />
  if (isError || !player) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">
          {error instanceof ApiError && error.status === 404 ? 'Jugador no encontrado' : 'No se pudo cargar el jugador'}
        </h1>
        <ErrorState error={error ?? new Error('No encontramos a ese jugador.')} onRetry={error ? () => void refetch() : undefined} />
        <Link to="/" className="text-sky-700 underline">Volver al ranking</Link>
      </div>
    )
  }

  const { stats } = player
  const details = [
    player.hand && handLabel[player.hand],
    player.backhand && backhandLabel[player.backhand],
    `En el club desde ${formatDate(player.joinedAt)}`,
  ].filter(Boolean)

  return (
    <div className="space-y-8">
      <Link to="/" className="text-sm text-sky-700 underline">← Ranking</Link>

      <header className="flex items-center gap-4">
        <Avatar player={player} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{player.fullName}</h1>
          {player.nickname && <p className="text-slate-600">“{player.nickname}”</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-lg">
            {player.position !== null ? (
              <>
                <span className="font-bold">Puesto #{player.position}</span>
                <MovementBadge movement={player.movement} />
              </>
            ) : (
              <span className="text-slate-600">Fuera del ranking</span>
            )}
            {!player.isActive && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Inactivo</span>}
          </p>
        </div>
      </header>

      <p className="text-sm text-slate-600">{details.join(' · ')}</p>

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="text-lg font-semibold">Estadísticas</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Partidos jugados" value={stats.played} />
          <Stat label="Ganados" value={stats.wins} />
          <Stat label="Perdidos" value={stats.losses} />
          <Stat label="% de victorias" value={percentage(stats.winPercentage)} />
          <Stat label="Racha actual" value={streakDescription(stats.currentStreak)} small />
          <Stat label="Desafíos ganados" value={stats.challengesWon} />
          <Stat label="Desafíos perdidos" value={stats.challengesLost} />
          <Stat label="Defensas ganadas" value={stats.defensesWon} />
          <Stat label="Defensas perdidas" value={stats.defensesLost} />
          <Stat label="Mejor posición" value={player.bestPosition === null ? '—' : `#${player.bestPosition}`} />
        </dl>
      </section>

      <section aria-labelledby="challenge-title">
        <h2 id="challenge-title" className="text-lg font-semibold">A quiénes puede desafiar hoy</h2>
        {player.canChallenge.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {player.canChallenge.map((c) => (
              <li key={c.player.id}>
                <Link
                  to={`/players/${c.player.id}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm hover:bg-slate-50"
                >
                  <span className="w-8 text-right font-bold tabular-nums">#{c.position}</span>
                  <Avatar player={c.player} size="sm" />
                  <span className="truncate">{c.player.fullName}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-slate-600">
            {player.position === 1 ? 'Es el número uno: no hay nadie por encima para desafiar.' : 'No está en el ranking, así que no puede desafiar.'}
          </p>
        )}
      </section>

      <section aria-labelledby="chart-title">
        <h2 id="chart-title" className="text-lg font-semibold">Evolución de la posición</h2>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <PositionChart points={player.positionHistory} />
        </div>
      </section>

      <section aria-labelledby="matches-title">
        <h2 id="matches-title" className="text-lg font-semibold">Últimos partidos</h2>
        <div className="mt-3">
          {matches.isPending && <LoadingState label="Cargando partidos…" />}
          {matches.isError && <ErrorState error={matches.error} onRetry={() => void matches.refetch()} />}
          {matches.data && matches.data.items.length === 0 && <p className="text-slate-600">Todavía no jugó partidos.</p>}
          {matches.data && matches.data.items.length > 0 && (
            <>
              <ul className="space-y-2">
                {matches.data.items.map((m) => (
                  <MatchCard key={m.id} match={m} perspectiveId={id} />
                ))}
              </ul>
              {matches.data.total > RECENT_MATCHES && (
                <Link to={`/matches?playerId=${id}`} className="mt-3 inline-block text-sky-700 underline">
                  Ver los {matches.data.total} partidos
                </Link>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, small = false }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className={`mt-1 font-bold tabular-nums ${small ? 'text-base' : 'text-2xl'}`}>{value}</dd>
    </div>
  )
}
