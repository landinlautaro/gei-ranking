import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '../api/health'

export function HomePage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  })

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Ranking de Tenis GEI</h1>
      <p className="mt-1 text-slate-600">Estado del sistema</p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" role="status">
        {isPending && <p>Conectando con el servidor…</p>}
        {isError && (
          <p className="text-red-700">
            No se pudo conectar: {error instanceof Error ? error.message : 'error desconocido'}
          </p>
        )}
        {data && (
          <p className="text-green-700">
            Backend {data.status === 'ok' ? 'OK' : data.status} · Base de datos {data.database === 'ok' ? 'OK' : data.database}
          </p>
        )}
      </div>
    </main>
  )
}
