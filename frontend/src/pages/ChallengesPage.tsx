import { useChallenges } from '../api/queries'
import type { Challenge } from '../api/types'
import { ChallengeCard } from '../components/ChallengeCard'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function Section({ id, title, hint, challenges }: { id: string; title: string; hint?: string; challenges: Challenge[] }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {title} <span className="font-normal text-slate-700">({challenges.length})</span>
      </h2>
      {hint && <p className="mt-1 text-sm text-slate-700">{hint}</p>}
      <ul className="mt-3 space-y-2">
        {challenges.map((c) => (
          <ChallengeCard key={c.id} challenge={c} />
        ))}
      </ul>
    </section>
  )
}

export function ChallengesPage() {
  useDocumentTitle('Desafíos')
  const { data, isPending, isError, error, refetch } = useChallenges()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Desafíos</h1>
        <p className="mt-1 text-slate-700">Se desafía de lunes a miércoles y el partido se juega hasta el domingo.</p>
      </header>

      {isPending && <LoadingState label="Cargando desafíos…" />}
      {isError && <ErrorState error={error} onRetry={() => void refetch()} />}

      {data && (
        <>
          {data.active.length === 0 && data.expired.length === 0 && data.recentlyPlayed.length === 0 ? (
            <EmptyState>No hay desafíos por ahora.</EmptyState>
          ) : (
            <>
              <Section id="active-title" title="Pendientes" challenges={data.active} />
              {data.active.length === 0 && <EmptyState>No hay desafíos pendientes.</EmptyState>}
              {data.expired.length > 0 && (
                <Section
                  id="expired-title"
                  title="Vencidos"
                  hint="Pasó el plazo sin que se cargue el resultado: el coordinador decide cómo seguir."
                  challenges={data.expired}
                />
              )}
              {data.recentlyPlayed.length > 0 && (
                <Section id="played-title" title="Jugados en los últimos 7 días" challenges={data.recentlyPlayed} />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
