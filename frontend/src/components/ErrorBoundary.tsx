import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/** Last line of defense: a crash while rendering shows a message instead of a blank page. */
class Boundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Algo salió mal</h1>
        <p className="mt-2 text-slate-700">La página tuvo un problema inesperado. Probá recargarla; si sigue pasando, avisale a quien administra el ranking.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Recargar la página
          </button>
          <a href="/" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            Ir al ranking
          </a>
        </div>
      </main>
    )
  }
}

/** Remounted on every navigation, so moving to another page recovers from a crash on the previous one. */
export function ErrorBoundary({ children }: Props) {
  const location = useLocation()
  return <Boundary key={location.pathname}>{children}</Boundary>
}
