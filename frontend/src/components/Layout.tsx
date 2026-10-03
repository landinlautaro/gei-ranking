import { useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useFocusMainOnNavigation } from '../lib/useFocusMain'
import { SkipLink } from './SkipLink'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`

export function Layout() {
  const main = useRef<HTMLElement>(null)
  useFocusMainOnNavigation(main)

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Ranking GEI
          </Link>
          <nav aria-label="Principal" className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Ranking
            </NavLink>
            <NavLink to="/matches" className={navClass}>
              Partidos
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="contenido" ref={main} tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none">
        <Outlet />
      </main>
      <footer className="px-4 py-6 text-center text-xs text-slate-500">
        Ranking interno de tenis · Club GEI ·{' '}
        <Link to="/admin" className="underline">Administración</Link>
      </footer>
    </div>
  )
}
