// Shapes of the public API responses (see backend Dtos/PublicDtos.cs).

export interface PlayerRef {
  id: number
  fullName: string
  nickname: string | null
  photoPath: string | null
}

export interface RankingRow {
  position: number
  player: PlayerRef
  played: number
  wins: number
  losses: number
  challengesWon: number
  challengesLost: number
  previousPosition: number | null
  /** Previous position minus current: positive = moved up, negative = moved down. */
  movement: number
}

export interface PlayerListItem extends PlayerRef {
  isActive: boolean
  position: number | null
}

export interface PlayerStats {
  played: number
  wins: number
  losses: number
  challengesWon: number
  challengesLost: number
  defensesWon: number
  defensesLost: number
  winPercentage: number | null
  /** Positive = consecutive wins, negative = consecutive losses. */
  currentStreak: number
}

export interface PositionPoint {
  at: string
  /** null = not in the ranking from this moment (removed). */
  position: number | null
}

export interface PlayerProfile extends PlayerRef {
  hand: 'RightHanded' | 'LeftHanded' | null
  backhand: 'OneHanded' | 'TwoHanded' | null
  joinedAt: string
  isActive: boolean
  position: number | null
  previousPosition: number | null
  movement: number
  bestPosition: number | null
  stats: PlayerStats
  canChallenge: RankingRow[]
  positionHistory: PositionPoint[]
  /** Challenges he is in that are still open (expired ones included), soonest deadline first. */
  activeChallenges: Challenge[]
}

/** Stored status; "expired" is derived (see `isExpired`). */
export type ChallengeStatus = 'Pending' | 'Scheduled' | 'Played' | 'Cancelled'

export interface Challenge {
  id: number
  challenger: PlayerRef
  challenged: PlayerRef
  /** Current positions; null when not ranked. */
  challengerPosition: number | null
  challengedPosition: number | null
  issuedAt: string
  deadlineAt: string
  status: ChallengeStatus
  /** Open and past its deadline. */
  isExpired: boolean
  /** Date and time the players agreed on, if they did. */
  scheduledAt: string | null
  matchId: number | null
}

export interface ChallengeBoard {
  /** Open and on time, soonest deadline first. */
  active: Challenge[]
  /** Open but past the deadline, oldest first. */
  expired: Challenge[]
  /** Settled in the last 7 days. */
  recentlyPlayed: Challenge[]
}

export type Completion = 'Normal' | 'Walkover' | 'Retirement'

export interface Match {
  id: number
  playedAt: string
  challenger: PlayerRef
  challenged: PlayerRef
  winner: PlayerRef
  /** "6-4 3-6 10-7", "W.O." or "6-2 3-1 (ab.)". */
  result: string
  completion: Completion
  challengerPositionBefore: number | null
  challengerPositionAfter: number | null
  challengedPositionBefore: number | null
  challengedPositionAfter: number | null
  movementText: string | null
  notes: string | null
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface MatchFilters {
  playerId?: number
  /** With `playerId`: only the matches between those two players. */
  opponentId?: number
  from?: string
  to?: string
  page?: number
  pageSize?: number
}
