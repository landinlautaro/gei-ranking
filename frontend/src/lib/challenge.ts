import type { ChallengeBoard } from '../api/types'
import { clubDateInput, formatDayMonth, plural } from './format'

/** A player can challenge up to this many places above their own. */
export const CHALLENGE_RANGE = 5

export type ChallengeRelation = 'canChallenge' | 'canBeChallenged' | 'outOfRange'

/** How `mine` and `theirs` (ranking positions) relate under the challenge rule. */
export function challengeRelation(mine: number, theirs: number): ChallengeRelation {
  const gap = mine - theirs
  if (gap >= 1 && gap <= CHALLENGE_RANGE) return 'canChallenge'
  if (gap <= -1 && gap >= -CHALLENGE_RANGE) return 'canBeChallenged'
  return 'outOfRange'
}

/**
 * Ids of the players in an open challenge (on time or expired, in either role). Used to grey them out where
 * players are offered as rivals; with no board (not loaded yet, or it failed) nobody is greyed out.
 */
export function playersWithOpenChallenge(board: Pick<ChallengeBoard, 'active' | 'expired'> | undefined): Set<number> {
  return new Set([...(board?.active ?? []), ...(board?.expired ?? [])].flatMap((c) => [c.challenger.id, c.challenged.id]))
}

const DAY_MS = 86_400_000

/** Whole club-local calendar days from `from` to `to` (negative when `to` is earlier). */
function clubDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${clubDateInput(from)}T00:00:00Z`)
  const b = Date.parse(`${clubDateInput(to)}T00:00:00Z`)
  return Math.round((b - a) / DAY_MS)
}

export type DeadlineState = 'upcoming' | 'today' | 'expired'

export interface ChallengeDeadline {
  state: DeadlineState
  /** Calendar days left, 0 on the deadline day, never negative. */
  daysLeft: number
  /** "Vence el dom 26/10 · quedan 3 días", "Vence hoy" or "Venció el dom 19/10". */
  label: string
}

/**
 * Countdown to a challenge's deadline, in club calendar days: the deadline is the end of a Sunday, so on that
 * Sunday it "expires today" and on Monday it is already expired.
 */
export function challengeDeadline(deadlineAt: string, now: Date = new Date()): ChallengeDeadline {
  const deadline = new Date(deadlineAt)
  if (now > deadline) return { state: 'expired', daysLeft: 0, label: `Venció el ${formatDayMonth(deadlineAt)}` }

  const daysLeft = clubDaysBetween(now, deadline)
  if (daysLeft <= 0) return { state: 'today', daysLeft: 0, label: 'Vence hoy' }

  const remaining = `${daysLeft === 1 ? 'queda' : 'quedan'} ${plural(daysLeft, 'día', 'días')}`
  return { state: 'upcoming', daysLeft, label: `Vence el ${formatDayMonth(deadlineAt)} · ${remaining}` }
}
