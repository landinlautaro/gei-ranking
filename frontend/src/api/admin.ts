import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { request } from './client'
import type {
  AdjustmentResult,
  AdminMatch,
  AdminMatchFilters,
  AdminPlayer,
  LoginResponse,
  MatchChangeResult,
  MatchInput,
  MatchPreview,
  PlayerInput,
} from './adminTypes'
import type { Paged } from './types'

const admin = (path: string) => `/api/admin${path}`

export function login(username: string, password: string) {
  return request<LoginResponse>('POST', '/api/auth/login', { body: { username, password } })
}

// Everything the public pages show can change after an admin action, so any write refreshes all of it.
function invalidateEverything(client: QueryClient) {
  return client.invalidateQueries()
}

// ---- Players ----

export function useAdminPlayers() {
  return useQuery({
    queryKey: ['admin', 'players'],
    queryFn: ({ signal }) => request<AdminPlayer[]>('GET', admin('/players'), { auth: true, signal }),
  })
}

export function useAdminPlayer(id: number | null) {
  return useQuery({
    queryKey: ['admin', 'player', id],
    queryFn: ({ signal }) => request<AdminPlayer>('GET', admin(`/players/${id}`), { auth: true, signal }),
    enabled: id !== null,
  })
}

export function useCreatePlayer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: PlayerInput & { position: number | null }) =>
      request<AdminPlayer>('POST', admin('/players'), { auth: true, body: input }),
    onSuccess: () => invalidateEverything(client),
  })
}

export function useUpdatePlayer(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: PlayerInput) => request<AdminPlayer>('PUT', admin(`/players/${id}`), { auth: true, body: input }),
    onSuccess: () => invalidateEverything(client),
  })
}

export function useDeactivatePlayer(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => request<AdminPlayer>('POST', admin(`/players/${id}/deactivate`), { auth: true }),
    onSuccess: () => invalidateEverything(client),
  })
}

export function useReactivatePlayer(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (position: number | null) =>
      request<AdminPlayer>('POST', admin(`/players/${id}/reactivate`), { auth: true, body: { position } }),
    onSuccess: () => invalidateEverything(client),
  })
}

export function useUploadPhoto(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return request<AdminPlayer>('PUT', admin(`/players/${id}/photo`), { auth: true, form })
    },
    onSuccess: () => invalidateEverything(client),
  })
}

export function useDeletePhoto(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => request<AdminPlayer>('DELETE', admin(`/players/${id}/photo`), { auth: true }),
    onSuccess: () => invalidateEverything(client),
  })
}

// ---- Matches ----

export function useAdminMatches(filters: AdminMatchFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'matches', filters],
    queryFn: ({ signal }) => request<Paged<AdminMatch>>('GET', admin('/matches'), { auth: true, params: { ...filters }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useAdminMatch(id: number | null) {
  return useQuery({
    queryKey: ['admin', 'match', id],
    queryFn: ({ signal }) => request<AdminMatch>('GET', admin(`/matches/${id}`), { auth: true, signal }),
    enabled: id !== null,
  })
}

/** Live preview: validates and shows the movement without saving. Nothing is cached between edits. */
export function useMatchPreview(input: MatchInput | null, editingMatchId: number | null) {
  return useQuery({
    queryKey: ['admin', 'preview', input, editingMatchId],
    queryFn: ({ signal }) =>
      request<MatchPreview>('POST', admin('/matches/preview'), {
        auth: true,
        params: { editingMatchId },
        body: input,
        signal,
      }),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useCreateMatch() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: MatchInput) => request<MatchChangeResult>('POST', admin('/matches'), { auth: true, body: input }),
    onSuccess: () => invalidateEverything(client),
  })
}

export function useUpdateMatch(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: MatchInput) => request<MatchChangeResult>('PUT', admin(`/matches/${id}`), { auth: true, body: input }),
    onSuccess: () => invalidateEverything(client),
  })
}

export function useVoidMatch() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => request<MatchChangeResult>('POST', admin(`/matches/${id}/void`), { auth: true }),
    onSuccess: () => invalidateEverything(client),
  })
}

// ---- Ranking ----

export function useAdjustPosition() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { playerId: number; newPosition: number; reason: string }) =>
      request<AdjustmentResult>('POST', admin('/ranking/adjustments'), { auth: true, body: input }),
    onSuccess: () => invalidateEverything(client),
  })
}
