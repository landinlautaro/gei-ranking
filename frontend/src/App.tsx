import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { LoadingState } from './components/PageState'
import { MatchesPage } from './pages/MatchesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlayerPage } from './pages/PlayerPage'
import { RankingPage } from './pages/RankingPage'

// The administration is only for one person: its code is downloaded on demand, so the public pages stay light.
const AdminLayout = lazy(() => import('./components/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const LoginPage = lazy(() => import('./pages/admin/LoginPage').then((m) => ({ default: m.LoginPage })))
const NewResultPage = lazy(() => import('./pages/admin/ResultPages').then((m) => ({ default: m.NewResultPage })))
const EditMatchPage = lazy(() => import('./pages/admin/ResultPages').then((m) => ({ default: m.EditMatchPage })))
const AdminMatchesPage = lazy(() => import('./pages/admin/AdminMatchesPage').then((m) => ({ default: m.AdminMatchesPage })))
const AdminPlayersPage = lazy(() => import('./pages/admin/AdminPlayersPages').then((m) => ({ default: m.AdminPlayersPage })))
const NewPlayerPage = lazy(() => import('./pages/admin/AdminPlayersPages').then((m) => ({ default: m.NewPlayerPage })))
const EditPlayerPage = lazy(() => import('./pages/admin/AdminPlayersPages').then((m) => ({ default: m.EditPlayerPage })))
const AdjustmentPage = lazy(() => import('./pages/admin/AdjustmentPage').then((m) => ({ default: m.AdjustmentPage })))

const loading = <LoadingState label="Cargando…" />

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RankingPage />} />
        <Route path="players/:id" element={<PlayerPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="admin/login" element={<Suspense fallback={loading}><LoginPage /></Suspense>} />
      <Route path="admin" element={<Suspense fallback={loading}><AdminLayout /></Suspense>}>
        <Route index element={<Navigate to="results/new" replace />} />
        <Route path="results/new" element={<NewResultPage />} />
        <Route path="matches" element={<AdminMatchesPage />} />
        <Route path="matches/:id/edit" element={<EditMatchPage />} />
        <Route path="players" element={<AdminPlayersPage />} />
        <Route path="players/new" element={<NewPlayerPage />} />
        <Route path="players/:id" element={<EditPlayerPage />} />
        <Route path="adjustments" element={<AdjustmentPage />} />
      </Route>
    </Routes>
  )
}
