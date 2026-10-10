import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useMatches, usePlayer } from '../api/queries'
import { Avatar } from '../components/Avatar'
import { MatchCard } from '../components/MatchCard'
import { MovementBadge } from '../components/MovementBadge'
import { Button } from '../components/ui'
import { ErrorState, LoadingState } from '../components/PageState'
import { PositionChart } from '../components/PositionChart'
import { CHALLENGE_RANGE, challengeRelation, type ChallengeRelation } from '../lib/challenge'
import { backhandLabel, formatDate, handLabel, percentage, streakDescription } from '../lib/format'
import { clearMe, setMe, useMe } from '../lib/meStore'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { PlayerProfile } from '../api/types'

const RECENT_MATCHES = 10
// The API caps pages at 100, enough to count the whole record between two players; only the latest few are listed.
const H2H_MATCHES = 100
const H2H_LISTED = 5

export function PlayerPage() {
  const id = Number(useParams().id)
  const meId = useMe()
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
        <Link to="/" className="text-brand hover:text-accent underline">Volver al ranking</Link>
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
      <Link to="/" className="text-sm text-brand hover:text-accent underline">← Ranking</Link>

      <header className="flex items-center gap-4">
        <Avatar player={player} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{player.fullName}</h1>
          {player.nickname && <p className="text-slate-700">“{player.nickname}”</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-lg">
            {player.position !== null ? (
              <>
                <span className="font-bold">Puesto #{player.position}</span>
                <MovementBadge movement={player.movement} />
              </>
            ) : (
              <span className="text-slate-700">Fuera del ranking</span>
            )}
            {!player.isActive && <span className="rounded bg-slate-200 px-2 py-0.5 text-sm font-semibold text-slate-700">Inactivo</span>}
          </p>
        </div>
      </header>

      <div className="space-y-3">
        <p className="text-sm text-slate-700">{details.join(' · ')}</p>
        {player.isActive &&
          (meId === player.id ? (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-medium">
              ✓ Este sos vos
              <button type="button" onClick={clearMe} className="min-h-12 text-brand underline hover:text-accent">No soy yo</button>
            </p>
          ) : (
            <Button variant="secondary" onClick={() => setMe(player.id)}>Soy yo</Button>
          ))}
      </div>

      {meId !== null && meId !== player.id && <HeadToHead meId={meId} rival={player} />}

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
          <p className="mt-3 text-slate-700">
            {player.position === 1 ? 'Es el número uno: no hay nadie por encima para desafiar.' : 'No está en el ranking, así que no puede desafiar.'}
          </p>
        )}
      </section>

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="text-lg font-semibold">Estadísticas</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Partidos jugados" value={stats.played} />
          <Stat label="% de victorias" value={percentage(stats.winPercentage)} />
          <Stat label="Racha actual" value={streakDescription(stats.currentStreak)} small />
          <Stat label="Mejor posición" value={player.bestPosition === null ? '—' : `#${player.bestPosition}`} />
        </dl>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Ganados" value={stats.wins} minor />
          <Stat label="Perdidos" value={stats.losses} minor />
          <Stat label="Desafíos ganados" value={stats.challengesWon} minor />
          <Stat label="Desafíos perdidos" value={stats.challengesLost} minor />
          <Stat label="Defensas ganadas" value={stats.defensesWon} minor />
          <Stat label="Defensas perdidas" value={stats.defensesLost} minor />
        </dl>
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
          {matches.data && matches.data.items.length === 0 && <p className="text-slate-700">Todavía no jugó partidos.</p>}
          {matches.data && matches.data.items.length > 0 && (
            <>
              <ul className="space-y-2">
                {matches.data.items.map((m) => (
                  <MatchCard key={m.id} match={m} perspectiveId={id} />
                ))}
              </ul>
              {matches.data.total > RECENT_MATCHES && (
                <Link to={`/matches?playerId=${id}`} className="mt-3 inline-block text-brand hover:text-accent underline">
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

function Stat({ label, value, small = false, minor = false }: { label: string; value: React.ReactNode; small?: boolean; minor?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${minor ? 'flex items-baseline justify-between gap-2 px-3 py-2' : 'p-3'}`}>
      <dt className="text-base text-slate-700">{label}</dt>
      <dd className={`font-bold tabular-nums ${minor ? 'text-lg' : small ? 'mt-1 text-lg' : 'mt-1 text-3xl'}`}>{value}</dd>
    </div>
  )
}

/** "Vos vs X": shown when "Soy yo" is set and you look at someone else — the record between you and whether the challenge rule lets you play. */
function HeadToHead({ meId, rival }: { meId: number; rival: PlayerProfile }) {
  const me = usePlayer(meId)
  const games = useMatches({ playerId: meId, opponentId: rival.id, pageSize: H2H_MATCHES })

  if (!me.data || !games.data) return null

  const wins = games.data.items.filter((m) => m.winner.id === meId).length
  const losses = games.data.items.length - wins
  const myPosition = me.data.position
  const relation =
    myPosition !== null && rival.position !== null ? RELATION_TEXT[challengeRelation(myPosition, rival.position)] : null

  return (
    <section aria-labelledby="h2h-title" className="rounded-lg border-2 border-brand bg-white p-4 shadow-sm">
      <h2 id="h2h-title" className="text-lg font-semibold">Vos vs {rival.nickname ?? rival.fullName}</h2>
      <p className="mt-1 text-lg">
        {games.data.items.length === 0
          ? 'Todavía no jugaron entre ustedes.'
          : `Ganaste ${wins} · Perdiste ${losses}`}
      </p>
      {relation && <p className="mt-1 font-medium text-brand">{relation}</p>}
      {games.data.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {games.data.items.slice(0, H2H_LISTED).map((m) => (
            <MatchCard key={m.id} match={m} perspectiveId={meId} />
          ))}
        </ul>
      )}
    </section>
  )
}

const RELATION_TEXT: Record<ChallengeRelation, string> = {
  canChallenge: 'Lo podés desafiar.',
  canBeChallenged: 'Te puede desafiar.',
  outOfRange: `Están a más de ${CHALLENGE_RANGE} puestos: por ahora no pueden desafiarse.`,
}
