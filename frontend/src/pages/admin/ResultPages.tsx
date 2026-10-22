import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAdminChallenge, useAdminMatch } from '../../api/admin'
import { MatchForm } from '../../components/admin/MatchForm'
import { ErrorState, LoadingState } from '../../components/PageState'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function NewResultPage() {
  useDocumentTitle('Cargar resultado')
  const requested = Number(useSearchParams()[0].get('challengeId'))
  const challengeId = Number.isInteger(requested) && requested > 0 ? requested : null
  const challenge = useAdminChallenge(challengeId)

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Cargar resultado</h1>
      {challengeId === null && <MatchForm />}
      {challengeId !== null && challenge.isPending && <LoadingState label="Cargando desafío…" />}
      {challengeId !== null && challenge.isError && <ErrorState error={challenge.error} onRetry={() => void challenge.refetch()} />}
      {challenge.data && !(challenge.data.status === 'Pending' || challenge.data.status === 'Scheduled') && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Este desafío ya no está abierto, así que no se le puede cargar un resultado.{' '}
          <Link to="/admin/challenges" className="underline">Ver desafíos</Link>
        </p>
      )}
      {challenge.data && (challenge.data.status === 'Pending' || challenge.data.status === 'Scheduled') && (
        <MatchForm key={challenge.data.id} challenge={challenge.data} />
      )}
    </>
  )
}

export function EditMatchPage() {
  useDocumentTitle('Editar partido')
  const id = Number(useParams().id)
  const valid = Number.isInteger(id) && id > 0
  const { data, isPending, isError, error, refetch } = useAdminMatch(valid ? id : null)

  return (
    <>
      <Link to="/admin/matches" className="text-sm text-brand hover:text-accent underline">← Partidos</Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold">Editar partido</h1>
      {!valid && <ErrorState error={new Error('Partido inválido.')} />}
      {valid && isPending && <LoadingState label="Cargando partido…" />}
      {valid && isError && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data?.status === 'Voided' && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Este partido está anulado y no se puede editar.
        </p>
      )}
      {data && data.status === 'Valid' && <MatchForm key={data.id} match={data} />}
    </>
  )
}
