import { Suspense, useEffect, useRef } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { setUnauthorizedHandler } from '../../api/client'
import { clearSession, useSession } from '../../lib/authStore'
import { useFocusMainOnNavigation } from '../../lib/useFocusMain'
import { LoadingState } from '../PageState'
import { SkipLink } from '../SkipLink'
import { Button } from '../ui'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap inline-flex min-h-12 items-center px-3 text-sm uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    isActive ? 'font-extrabold text-brand underline decoration-2 underline-offset-8' : 'font-medium text-black hover:text-brand'
  }`

/** Gate for everything under /admin: without a session you go to the login; a rejected token ends the session. */
export function AdminLayout() {
  const session = useSession()
  const location = useLocation()
  const main = useRef<HTMLElement>(null)
  useFocusMainOnNavigation(main)

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession('expired'))
    return () => setUnauthorizedHandler(null)
  }, [])

  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/admin/results/new" className="text-lg font-black uppercase tracking-tight text-brand">
            Ranking GEI <span className="text-sm font-medium normal-case text-slate-700">· Administración</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/" className="text-brand hover:text-accent underline">Ver sitio público</Link>
            <span className="text-slate-700">{session.username}</span>
            <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => clearSession()}>
              Salir
            </Button>
          </div>
        </div>
        <nav aria-label="Administración" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          <NavLink to="/admin/results/new" className={navClass}>Cargar resultado</NavLink>
          <NavLink to="/admin/matches" className={navClass}>Partidos</NavLink>
          <NavLink to="/admin/players" className={navClass}>Jugadores</NavLink>
          <NavLink to="/admin/share" className={navClass}>Publicar</NavLink>
          <NavLink to="/admin/adjustments" className={navClass}>Ajustes</NavLink>
        </nav>
      </header>
      <main id="contenido" ref={main} tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none">
        <Suspense fallback={<LoadingState label="Cargando…" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
