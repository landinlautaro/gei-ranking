import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/admin/AdminLayout'
import { Layout } from './components/Layout'
import { AdjustmentPage } from './pages/admin/AdjustmentPage'
import { AdminMatchesPage } from './pages/admin/AdminMatchesPage'
import { AdminPlayersPage, EditPlayerPage, NewPlayerPage } from './pages/admin/AdminPlayersPages'
import { LoginPage } from './pages/admin/LoginPage'
import { EditMatchPage, NewResultPage } from './pages/admin/ResultPages'
import { MatchesPage } from './pages/MatchesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlayerPage } from './pages/PlayerPage'
import { RankingPage } from './pages/RankingPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RankingPage />} />
        <Route path="players/:id" element={<PlayerPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="admin/login" element={<LoginPage />} />
      <Route path="admin" element={<AdminLayout />}>
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
