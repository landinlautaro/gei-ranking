import { useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useFocusMainOnNavigation } from '../lib/useFocusMain'
import { SkipLink } from './SkipLink'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-[0.8125rem] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    isActive ? 'font-extrabold text-brand' : 'font-medium text-black hover:text-brand'
  }`

export function Layout() {
  const main = useRef<HTMLElement>(null)
  useFocusMainOnNavigation(main)

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-black uppercase tracking-tight text-brand">
            Ranking GEI
          </Link>
          <nav aria-label="Principal" className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Ranking
            </NavLink>
            <NavLink to="/matches" className={navClass}>
              Partidos
            </NavLink>
            <NavLink to="/rules" className={navClass}>
              Reglamento
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="contenido" ref={main} tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none">
        <Outlet />
      </main>
      <footer className="bg-surface px-4 py-6 text-center text-xs text-slate-700">
        Ranking interno de tenis · Club GEI ·{' '}
        <Link to="/admin" className="underline">Administración</Link>
      </footer>
    </div>
  )
}
