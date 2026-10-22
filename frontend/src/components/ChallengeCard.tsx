import { Link } from 'react-router-dom'
import type { Challenge, PlayerRef } from '../api/types'
import { challengeDeadline, type DeadlineState } from '../lib/challenge'
import { formatDayMonthTime } from '../lib/format'
import { Avatar } from './Avatar'

const DEADLINE_STYLE: Record<DeadlineState, string> = {
  upcoming: 'bg-sky-50 text-brand-dark',
  today: 'bg-amber-100 text-amber-900',
  expired: 'bg-red-100 text-red-800',
}

function PlayerLink({ player, position }: { player: PlayerRef; position: number | null }) {
  return (
    <Link to={`/players/${player.id}`} className="inline-flex items-center gap-2 text-slate-900 hover:underline">
      {position !== null && <span className="w-8 text-right font-bold tabular-nums">#{position}</span>}
      <Avatar player={player} size="sm" />
      <span className="font-medium">{player.fullName}</span>
    </Link>
  )
}

interface ChallengeCardProps {
  challenge: Challenge
  /** When set (player profile), the card is told from this player's point of view. */
  perspectiveId?: number
  now?: Date
}

export function ChallengeCard({ challenge, perspectiveId, now }: ChallengeCardProps) {
  const played = challenge.status === 'Played'
  const deadline = challengeDeadline(challenge.deadlineAt, now)
  const isChallenger = challenge.challenger.id === perspectiveId

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {played ? (
          <span className="rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">Jugado</span>
        ) : (
          <span className={`rounded px-2 py-0.5 font-semibold ${DEADLINE_STYLE[deadline.state]}`}>{deadline.label}</span>
        )}
        {!played && challenge.scheduledAt && (
          <span className="rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">
            Coordinado: {formatDayMonthTime(challenge.scheduledAt)}
          </span>
        )}
      </div>

      {perspectiveId === undefined ? (
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <PlayerLink player={challenge.challenger} position={challenge.challengerPosition} />
          <span className="text-sm uppercase tracking-wide text-slate-700">desafía a</span>
          <PlayerLink player={challenge.challenged} position={challenge.challengedPosition} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-slate-700">{isChallenger ? 'Desafía a' : 'Lo desafía'}</span>
          {isChallenger ? (
            <PlayerLink player={challenge.challenged} position={challenge.challengedPosition} />
          ) : (
            <PlayerLink player={challenge.challenger} position={challenge.challengerPosition} />
          )}
        </div>
      )}
    </li>
  )
}
