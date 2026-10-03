import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
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
    </Routes>
  )
}
