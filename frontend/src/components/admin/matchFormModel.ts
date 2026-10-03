import type { AdminMatch, MatchInput, MatchScore, MatchSide, SetScore } from '../../api/adminTypes'
import type { Completion } from '../../api/types'
import { clubDateInput, clubNoonIso, todayClubDate } from '../../lib/format'
import { isSevenSix, isSplit, parseCount } from '../../lib/score'

export interface SetFields {
  c: string
  d: string
  tbC: string
  tbD: string
}

export interface FormState {
  challengerId: string
  challengedId: string
  date: string
  completion: Completion
  set1: SetFields
  set2: SetFields
  stbC: string
  stbD: string
  winner: MatchSide | ''
  notes: string
  confirmOutOfRange: boolean
}

const emptySet: SetFields = { c: '', d: '', tbC: '', tbD: '' }

export function emptyState(): FormState {
  return {
    challengerId: '',
    challengedId: '',
    date: todayClubDate(),
    completion: 'Normal',
    set1: emptySet,
    set2: emptySet,
    stbC: '',
    stbD: '',
    winner: '',
    notes: '',
    confirmOutOfRange: false,
  }
}

const setFields = (s: SetScore | undefined): SetFields =>
  s
    ? {
        c: String(s.challengerGames),
        d: String(s.challengedGames),
        tbC: s.tieBreak ? String(s.tieBreak.challenger) : '',
        tbD: s.tieBreak ? String(s.tieBreak.challenged) : '',
      }
    : emptySet

export function stateFromMatch(match: AdminMatch): FormState {
  const stb = match.score.superTieBreak
  return {
    challengerId: String(match.challenger.id),
    challengedId: String(match.challenged.id),
    date: clubDateInput(match.playedAt),
    completion: match.completion,
    set1: setFields(match.score.sets[0]),
    set2: setFields(match.score.sets[1]),
    stbC: stb ? String(stb.challenger) : '',
    stbD: stb ? String(stb.challenged) : '',
    winner: match.completion === 'Normal' ? '' : match.winner.id === match.challenger.id ? 'Challenger' : 'Challenged',
    notes: match.notes ?? '',
    confirmOutOfRange: false,
  }
}

function parsedSet(fields: SetFields): [number, number] | null {
  const c = parseCount(fields.c)
  const d = parseCount(fields.d)
  return c === null || d === null ? null : [c, d]
}

function toSetScore(fields: SetFields): SetScore | null {
  const games = parsedSet(fields)
  if (!games) return null
  const tbC = parseCount(fields.tbC)
  const tbD = parseCount(fields.tbD)
  const tieBreak = isSevenSix(...games) && tbC !== null && tbD !== null ? { challenger: tbC, challenged: tbD } : null
  return { challengerGames: games[0], challengedGames: games[1], tieBreak }
}

/** Whether the two sets are split one each, so a Super Tie-Break is played. */
export const needsSuperTieBreak = (state: FormState) => isSplit(parsedSet(state.set1), parsedSet(state.set2))

/**
 * The request for the preview/save, or null while the form is not complete enough to evaluate.
 * <paramref name="originalPlayedAt"/> is kept when editing and the date was not touched, so the time of day survives.
 */
export function toInput(state: FormState, originalPlayedAt?: string, allowOutOfRange = false): MatchInput | null {
  const challengerId = Number(state.challengerId)
  const challengedId = Number(state.challengedId)
  if (!challengerId || !challengedId || !state.date) return null

  const playedAt = originalPlayedAt && clubDateInput(originalPlayedAt) === state.date ? originalPlayedAt : clubNoonIso(state.date)
  const base = { challengerId, challengedId, playedAt, completion: state.completion, notes: state.notes.trim() || null, allowOutOfRange }

  if (state.completion === 'Walkover') {
    return state.winner ? { ...base, score: null, winner: state.winner } : null
  }

  const sets = [toSetScore(state.set1), toSetScore(state.set2)].filter((s): s is SetScore => s !== null)
  const stbC = parseCount(state.stbC)
  const stbD = parseCount(state.stbD)
  const stb = stbC !== null && stbD !== null ? { challenger: stbC, challenged: stbD } : null

  if (state.completion === 'Retirement') {
    if (!state.winner) return null
    const score: MatchScore = { sets, superTieBreak: sets.length === 2 ? stb : null }
    return { ...base, score, winner: state.winner }
  }

  // Normal: both sets complete (and the Super Tie-Break when they are split).
  if (sets.length < 2) return null
  if (needsSuperTieBreak(state) && !stb) return null
  return { ...base, score: { sets, superTieBreak: needsSuperTieBreak(state) ? stb : null }, winner: null }
}
