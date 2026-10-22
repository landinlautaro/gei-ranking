import { useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useFocusMainOnNavigation } from '../lib/useFocusMain'
import { SkipLink } from './SkipLink'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-12 items-center border-b-4 px-3 text-sm uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
    isActive ? 'border-brand bg-sky-50 font-extrabold text-brand-dark' : 'border-transparent font-medium text-black hover:bg-slate-100 hover:text-brand-dark'
  }`

export function Layout() {
  const main = useRef<HTMLElement>(null)
  useFocusMainOnNavigation(main)

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-3">
          <Link to="/" className="pb-2 text-lg font-black uppercase tracking-tight text-brand sm:pb-3">
            Ranking GEI
          </Link>
          <nav aria-label="Principal" className="-mx-3 flex sm:mx-0 sm:gap-1">
            <NavLink to="/" end className={navClass}>
              Ranking
            </NavLink>
            <NavLink to="/challenges" className={navClass}>
              Desafíos
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
      <footer className="bg-surface px-4 py-6 text-center text-sm text-slate-700">
        Ranking interno de tenis · Club GEI ·{' '}
        <Link to="/admin" className="underline">Administración</Link>
        <p className="mt-2">
          Desarrollado por{' '}
          <a
            href="https://www.linkedin.com/in/lalandin"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Lautaro Landin
          </a>
        </p>
      </footer>
    </div>
  )
}
