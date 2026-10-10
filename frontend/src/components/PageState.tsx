export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-slate-700">
      <span className="size-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-slate-300 border-t-slate-600" aria-hidden="true" />
      {label}
    </div>
  )
}

interface ErrorStateProps {
  error: unknown
  onRetry?: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
      <p className="font-semibold">Algo salió mal</p>
      <p className="mt-1 text-sm">{error instanceof Error ? error.message : 'Ocurrió un error inesperado.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-700">{children}</p>
}
