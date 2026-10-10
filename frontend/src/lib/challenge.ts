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
