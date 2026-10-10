import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRanking } from '../api/queries'
import { Avatar } from '../components/Avatar'
import { MovementBadge } from '../components/MovementBadge'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { normalizeText } from '../lib/format'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function RankingPage() {
  useDocumentTitle()
  const { data, isPending, isError, error, refetch } = useRanking()
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const term = normalizeText(search.trim())
    if (!data || !term) return data ?? []
    return data.filter((r) => normalizeText(`${r.player.fullName} ${r.player.nickname ?? ''}`).includes(term))
  }, [data, search])

  return (
    <>
      <h1 className="sr-only">Ranking</h1>
      <div>
        <label htmlFor="search" className="sr-only">
          Buscar jugador
        </label>
        <input
          id="search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar jugador…"
          className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        />
      </div>

      <div className="mt-4">
        {isPending && <LoadingState label="Cargando ranking…" />}
        {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
        {data && data.length === 0 && <EmptyState>Todavía no hay jugadores en el ranking.</EmptyState>}
        {data && data.length > 0 && rows.length === 0 && <EmptyState>Ningún jugador coincide con “{search}”.</EmptyState>}

        {rows.length > 0 && (
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
                  <tr key={r.player.id} className="hover:bg-slate-50">
                    <td className="py-2 pl-2 pr-1 text-right font-bold tabular-nums sm:pl-3">{r.position}</td>
                    <td className="w-full max-w-0 px-2 py-2 sm:px-3">
                      <Link to={`/players/${r.player.id}`} className="flex items-center gap-2 hover:underline sm:gap-2.5">
                        <Avatar player={r.player} />
                        <span className="min-w-0">
                          <span className="block break-words font-medium leading-tight sm:truncate">{r.player.fullName}</span>
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
