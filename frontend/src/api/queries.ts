import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiError, getJson } from './client'
import type { MatchFilters, Paged, Match, PlayerListItem, PlayerProfile, RankingRow } from './types'

/** Retry policy for the app's QueryClient: a missing resource (404) will not appear on retry; anything else gets one more chance. */
export const retryUnlessNotFound = (failureCount: number, error: Error) =>
  !(error instanceof ApiError && error.status === 404) && failureCount < 1

export function useRanking() {
  return useQuery({
    queryKey: ['ranking'],
    queryFn: ({ signal }) => getJson<RankingRow[]>('/api/ranking', undefined, signal),
  })
}

export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: ({ signal }) => getJson<PlayerListItem[]>('/api/players', { includeInactive: true }, signal),
  })
}

export function usePlayer(id: number) {
  return useQuery({
    queryKey: ['player', id],
    queryFn: ({ signal }) => getJson<PlayerProfile>(`/api/players/${id}`, undefined, signal),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useMatches(filters: MatchFilters, enabled = true) {
  return useQuery({
    queryKey: ['matches', filters],
    queryFn: ({ signal }) => getJson<Paged<Match>>('/api/matches', { ...filters }, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}
