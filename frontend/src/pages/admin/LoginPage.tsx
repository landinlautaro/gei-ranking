import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../../api/admin'
import { Button, Field, inputClass, Notice } from '../../components/ui'
import { saveSession, getLogoutReason, useSession } from '../../lib/authStore'
import { describeError } from '../../lib/errors'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

export function LoginPage() {
  useDocumentTitle('Ingresar')
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [expired] = useState(() => getLogoutReason() === 'expired')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/admin/results/new'

  const mutation = useMutation({
    mutationFn: () => login(username, password),
    onSuccess: (response) => {
      saveSession({ token: response.token, username: response.username, expiresAt: response.expiresAt })
      navigate(from, { replace: true })
    },
  })

  if (session && !mutation.isPending) return <Navigate to={from} replace />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-8">
      <h1 className="text-2xl font-bold">Administración</h1>
      <p className="mt-1 text-slate-700">Ingresá para cargar resultados y gestionar jugadores.</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        {expired && <Notice tone="warning" live>Tu sesión venció. Volvé a ingresar.</Notice>}
        {mutation.isError && <Notice tone="error" live>{describeError(mutation.error)}</Notice>}

        <Field label="Usuario">
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
          />
        </Field>
        <Field label="Contraseña">
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={mutation.isPending || !username || !password}>
          {mutation.isPending ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>

      <Link to="/" className="mt-6 text-center text-sm text-brand hover:text-accent underline">Volver al ranking</Link>
    </main>
  )
}
