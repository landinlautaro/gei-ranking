import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRanking } from '../api/queries'
import type { RankingRow } from '../api/types'
import { Avatar } from '../components/Avatar'
import { MeCard } from '../components/MeCard'
import { MovementBadge } from '../components/MovementBadge'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { normalizeText } from '../lib/format'
import { useMe } from '../lib/meStore'
import { useIsWide } from '../lib/useIsWide'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function RankingPage() {
  useDocumentTitle()
  const { data, isPending, isError, error, refetch } = useRanking()
  const [search, setSearch] = useState('')
  const meId = useMe()
  const wide = useIsWide()

  const rows = useMemo(() => {
    const term = normalizeText(search.trim())
    if (!data || !term) return data ?? []
    return data.filter((r) => normalizeText(`${r.player.fullName} ${r.player.nickname ?? ''}`).includes(term))
  }, [data, search])

  return (
    <>
      <h1 className="sr-only">Ranking</h1>
      <MeCard />
      <div className="mt-6">
        <label htmlFor="search" className="mb-1 block font-medium">
          Buscar jugador
        </label>
        <input
          id="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Escribí un nombre o apodo"
          className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        />
      </div>

      <div className="mt-4">
        {isPending && <LoadingState label="Cargando ranking…" />}
        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {data && data.length === 0 && <EmptyState>Todavía no hay jugadores en el ranking.</EmptyState>}
        {data && data.length > 0 && rows.length === 0 && <EmptyState>Ningún jugador coincide con “{search}”.</EmptyState>}

        {rows.length > 0 && !wide && <RankingList rows={rows} meId={meId} />}

        {rows.length > 0 && wide && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Ranking de jugadores</caption>
              <thead className="bg-slate-100 text-sm uppercase tracking-wide text-slate-700">
                <tr>
                  <th scope="col" className="py-2 pl-2 pr-1 text-right font-semibold sm:pl-3">
                    <abbr title="Posición" className="no-underline">Pos.</abbr>
                  </th>
                  <th scope="col" className="px-2 py-2 font-semibold sm:px-3">Jugador</th>
                  <Num title="Partidos jugados">PJ</Num>
                  <Num title="Partidos ganados">PG</Num>
                  <Num title="Partidos perdidos">PP</Num>
                  <Num title="Desafíos ganados" className="hidden sm:table-cell">
                    <span className="hidden md:inline">Desafíos </span>G
                  </Num>
                  <Num title="Desafíos perdidos" className="hidden sm:table-cell">
                    <span className="hidden md:inline">Desafíos </span>P
                  </Num>
                  <Num title="Posición anterior" className="hidden md:table-cell">Pos. ant.</Num>
                  <th scope="col" className="py-2 pl-1 pr-2 text-right sm:pr-3 font-semibold">
                    <abbr title="Movimiento" className="no-underline">Mov.</abbr>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.player.id} className={r.player.id === meId ? 'bg-sky-50' : 'hover:bg-slate-50'}>
                    <td className="py-2 pl-2 pr-1 text-right font-bold tabular-nums sm:pl-3">{r.position}</td>
                    <td className="w-full max-w-0 px-2 py-2 sm:px-3">
                      <Link to={`/players/${r.player.id}`} className="flex items-center gap-2 hover:underline sm:gap-2.5">
                        <Avatar player={r.player} />
                        <span className="min-w-0">
                          <span className="block break-words font-medium leading-tight sm:truncate">{r.player.fullName}{r.player.id === meId && ' (vos)'}</span>
                          {r.player.nickname && <span className="block break-words text-sm leading-tight text-slate-700 sm:truncate">“{r.player.nickname}”</span>}
                        </span>
                      </Link>
                    </td>
                    <Cell>{r.played}</Cell>
                    <Cell>{r.wins}</Cell>
                    <Cell>{r.losses}</Cell>
                    <Cell className="hidden sm:table-cell">{r.challengesWon}</Cell>
                    <Cell className="hidden sm:table-cell">{r.challengesLost}</Cell>
                    <Cell className="hidden md:table-cell">{r.previousPosition ?? '—'}</Cell>
                    <td className="py-2 pl-1 pr-2 text-right sm:pr-3">
                      <MovementBadge movement={r.movement} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

/** Phone layout: one big tappable row per player, no abbreviations. */
function RankingList({ rows, meId }: { rows: RankingRow[]; meId: number | null }) {
  return (
    <ol aria-label="Ranking de jugadores" className="space-y-2">
      {rows.map((r) => (
        <li key={r.player.id}>
          <Link
            to={`/players/${r.player.id}`}
            className={`flex min-h-16 items-center gap-3 rounded-lg border bg-white p-3 shadow-sm ${r.player.id === meId ? 'border-2 border-brand bg-sky-50' : 'border-slate-200'}`}
          >
            <span className="w-10 text-right text-2xl font-black tabular-nums">{r.position}</span>
            <Avatar player={r.player} />
            <span className="min-w-0 flex-1">
              <span className="block break-words text-lg font-semibold leading-tight">
                {r.player.fullName}
                {r.player.id === meId && ' (vos)'}
              </span>
              {r.player.nickname && <span className="block break-words text-slate-700">“{r.player.nickname}”</span>}
            </span>
            <MovementBadge movement={r.movement} />
          </Link>
        </li>
      ))}
    </ol>
  )
}

function Num({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-1 py-2 text-right font-semibold sm:px-1.5 ${className}`}>
      <abbr title={title} className="no-underline">
        {children}
      </abbr>
    </th>
  )
}

function Cell({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <td className={`px-1 py-2 text-right tabular-nums sm:px-1.5 ${className}`}>{children}</td>
}
