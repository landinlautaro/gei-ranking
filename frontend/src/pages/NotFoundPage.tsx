import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Página no encontrada')
  return (
    <div className="py-10 text-center">
      <h1 className="text-2xl font-bold">Página no encontrada</h1>
      <p className="mt-2 text-slate-600">La dirección que buscás no existe.</p>
      <Link to="/" className="mt-4 inline-block text-sky-700 underline">Ir al ranking</Link>
    </div>
  )
}
