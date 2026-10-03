import type { Completion, PlayerProfile, PlayerRef } from './types'

export type MatchSide = 'Challenger' | 'Challenged'
export type MatchStatus = 'Valid' | 'Voided'
export type RankingWarning = 'OutOfRange' | 'PlayerNotRanked' | 'SamePlayer' | 'InvalidWinner' | 'PlayerAlreadyRanked'
export type MovementKind = 'NotApplied' | 'ChallengerSwapped' | 'DefenderMovedUp' | 'NoChange'

export interface LoginResponse {
  token: string
  expiresAt: string
  username: string
}

export interface AdminPlayer {
  id: number
  fullName: string
  nickname: string | null
  photoPath: string | null
  hand: PlayerProfile['hand']
  backhand: PlayerProfile['backhand']
  joinedAt: string
  isActive: boolean
  position: number | null
}

export interface PlayerInput {
  fullName: string
  nickname: string | null
  hand: PlayerProfile['hand']
  backhand: PlayerProfile['backhand']
  joinedAt: string | null
}

export interface TieBreak {
  challenger: number
  challenged: number
}

export interface SetScore {
  challengerGames: number
  challengedGames: number
  tieBreak?: TieBreak | null
}

export interface MatchScore {
  sets: SetScore[]
  superTieBreak?: TieBreak | null
}

export interface MatchInput {
  challengerId: number
  challengedId: number
  playedAt: string
  completion: Completion
  score: MatchScore | null
  winner: MatchSide | null
  notes: string | null
  allowOutOfRange: boolean
}

export interface AdminMatch {
  id: number
  playedAt: string
  challenger: PlayerRef
  challenged: PlayerRef
  winner: PlayerRef
  result: string
  score: MatchScore
  completion: Completion
  status: MatchStatus
  challengerPositionBefore: number | null
  challengerPositionAfter: number | null
  challengedPositionBefore: number | null
  challengedPositionAfter: number | null
  movementText: string | null
  warning: RankingWarning | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface MatchChangeResult {
  match: AdminMatch
  newlyWarnedMatchIds: number[]
}

export interface MatchPreview {
  isValid: boolean
  errors: Record<string, string[]>
  winnerSide: MatchSide | null
  winnerId: number | null
  movement: MovementKind | null
  movementText: string | null
  challengerPositionBefore: number | null
  challengerPositionAfter: number | null
  challengedPositionBefore: number | null
  challengedPositionAfter: number | null
  warning: RankingWarning | null
  requiresOutOfRangeConfirmation: boolean
  newlyWarnedMatchIds: number[]
}

export interface AdminMatchFilters {
  playerId?: number
  from?: string
  to?: string
  status?: MatchStatus
  withWarnings?: boolean
  page?: number
  pageSize?: number
}

export interface AdjustmentResult {
  playerId: number
  fromPosition: number
  toPosition: number
}
