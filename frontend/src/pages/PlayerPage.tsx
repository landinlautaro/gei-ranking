import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useMatches, usePlayer } from '../api/queries'
import { Avatar } from '../components/Avatar'
import { MatchCard } from '../components/MatchCard'
import { MovementBadge } from '../components/MovementBadge'
import { ShareButton } from '../components/ShareButton'
import { Button } from '../components/ui'
import { ErrorState, LoadingState } from '../components/PageState'
import { PositionChart } from '../components/PositionChart'
import { CHALLENGE_RANGE, challengeRelation, type ChallengeRelation } from '../lib/challenge'
import { backhandLabel, formatDate, handLabel, percentage, streakDescription } from '../lib/format'
import { clearMe, setMe, useMe } from '../lib/meStore'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import type { PlayerProfile } from '../api/types'

const RECENT_MATCHES = 10
// Below this many matches the win percentage says little, so it is shown muted with a "Pocos partidos" note.
const FEW_MATCHES = 3
// Slightly tighter on phones so the two header buttons share one row at 375px.
const HEADER_BUTTON = '!px-3 !text-sm sm:!px-4 sm:!text-base'
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
  const fewMatches = stats.played < FEW_MATCHES
  const details = [
    player.hand && handLabel[player.hand],
    player.backhand && backhandLabel[player.backhand],
    `En el club desde ${formatDate(player.joinedAt)}`,
  ].filter(Boolean)

  return (
    <div className="space-y-8">
      <Link to="/" className="inline-flex min-h-12 items-center text-sm text-brand hover:text-accent underline">← Ranking</Link>

      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar player={player} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-2xl font-bold">{player.fullName}</h1>
                {player.position !== null && (
                  <span className="flex items-center gap-2 text-lg">
                    <span className="rounded-lg bg-brand px-3 py-0.5 text-2xl font-black tabular-nums text-white">
                      <span aria-hidden="true">#{player.position}</span>
                      <span className="sr-only">Puesto #{player.position}</span>
                    </span>
                    <MovementBadge movement={player.movement} />
                  </span>
                )}
              </div>
              {player.nickname && <p className="text-slate-700">“{player.nickname}”</p>}
              {(player.position === null || !player.isActive) && (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-lg">
                  {player.position === null && <span className="text-slate-700">Fuera del ranking</span>}
                  {!player.isActive && <span className="rounded bg-slate-200 px-2 py-0.5 text-sm font-semibold text-slate-700">Inactivo</span>}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0 sm:justify-end">
            {player.isActive &&
              (meId === player.id ? (
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-medium">
                  ✓ Este sos vos
                  <button type="button" onClick={clearMe} className="min-h-12 text-brand underline hover:text-accent">No soy yo</button>
                </p>
              ) : (
                <Button variant="secondary" className={HEADER_BUTTON} onClick={() => setMe(player.id)}>Este es mi perfil</Button>
              ))}
            <ShareButton label="Compartir perfil" title={`${player.fullName} · Ranking GEI`} className={HEADER_BUTTON} />
          </div>
        </div>

        <ul aria-label="Datos del jugador" className="flex flex-wrap gap-2">
          {details.map((detail) => (
            <li key={detail} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-base font-medium text-slate-900">
              {detail}
            </li>
          ))}
        </ul>
      </header>

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
          <Stat
            label="% de victorias"
            value={percentage(stats.winPercentage)}
            muted={fewMatches}
            hint={stats.played > 0 ? `${stats.wins}/${stats.played}${fewMatches ? ' · Pocos partidos' : ''}` : 'Pocos partidos'}
          />
          <Stat label="Racha actual" value={<StreakValue streak={stats.currentStreak} />} />
          <Stat label="Mejor posición" value={player.bestPosition === null ? '—' : `#${player.bestPosition}`} />
        </dl>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Stat label="Desafíos" value={`${stats.challengesWon}-${stats.challengesLost}`} hint="ganados - perdidos" />
          <Stat label="Defensas" value={`${stats.defensesWon}-${stats.defensesLost}`} hint="ganadas - perdidas" />
        </dl>
      </section>

      <section aria-labelledby="chart-title">
        <h2 id="chart-title" className="text-lg font-semibold">Evolución de la posición</h2>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <PositionChart points={player.positionHistory} from={new Date(player.joinedAt)} />
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

function Stat({ label, value, hint, muted = false }: { label: string; value: React.ReactNode; hint?: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <dt className="text-sm text-slate-700 sm:text-base">{label}</dt>
      <dd className={`mt-1 text-3xl font-bold tabular-nums ${muted ? 'text-slate-600' : ''}`}>{value}</dd>
      {hint && <dd className="text-sm text-slate-700">{hint}</dd>}
    </div>
  )
}

/** The streak count in the same big type as the other cards; the words ("victorias seguidas") go small underneath so they fit at 375px. */
function StreakValue({ streak }: { streak: number }) {
  if (streak === 0) return <>—</>
  const words = streakDescription(streak).replace(/^\d+ /, '')
  return (
    <>
      {Math.abs(streak)} <span className="block text-base font-medium">{words}</span>
    </>
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
