import { Link } from 'react-router-dom'
import type { Match, PlayerRef } from '../api/types'
import { formatDate } from '../lib/format'
import { Avatar } from './Avatar'

function PlayerLink({ player, isWinner }: { player: PlayerRef; isWinner: boolean }) {
  return (
    <Link
      to={`/players/${player.id}`}
      className={`inline-flex items-center gap-2 hover:underline ${isWinner ? 'font-bold text-slate-900' : 'text-slate-700'}`}
    >
      <Avatar player={player} size="sm" />
      <span>
        {player.fullName}
        {isWinner && <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-sm font-semibold text-green-800">Ganó</span>}
      </span>
    </Link>
  )
}

function positionChange(before: number | null, after: number | null) {
  if (before === null || after === null) return null
  return before === after ? `sigue #${after}` : `#${before} → #${after}`
}

interface MatchCardProps {
  match: Match
  /** When set (player profile), the card is told from this player's point of view. */
  perspectiveId?: number
}

export function MatchCard({ match, perspectiveId }: MatchCardProps) {
  const isChallenger = match.challenger.id === perspectiveId
  const won = match.winner.id === perspectiveId
  const own = isChallenger
    ? positionChange(match.challengerPositionBefore, match.challengerPositionAfter)
    : positionChange(match.challengedPositionBefore, match.challengedPositionAfter)

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-700">{formatDate(match.playedAt)}</span>
        <span className="text-lg font-bold text-slate-900">{match.result}</span>
      </div>

      {perspectiveId === undefined ? (
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <PlayerLink player={match.challenger} isWinner={match.winner.id === match.challenger.id} />
          <span className="text-sm uppercase tracking-wide text-slate-700">vs</span>
          <PlayerLink player={match.challenged} isWinner={match.winner.id === match.challenged.id} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`rounded px-2 py-0.5 text-base font-semibold ${won ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
          >
            {won ? 'Ganó' : 'Perdió'}
          </span>
          <span className="text-sm text-slate-700">{isChallenger ? 'Desafiante' : 'Desafiado'} · vs</span>
          <PlayerLink player={isChallenger ? match.challenged : match.challenger} isWinner={false} />
          {own && <span className="text-sm text-slate-700">· {own}</span>}
        </div>
      )}

      {perspectiveId === undefined && match.movementText && <p className="mt-2 text-sm text-slate-700">{match.movementText}</p>}
      {match.notes && <p className="mt-1 text-sm italic text-slate-700">{match.notes}</p>}
    </li>
  )
}
