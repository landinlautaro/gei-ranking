import { useEffect, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { Button } from './ui'

const FEEDBACK_MS = 2500

type Status = 'idle' | 'copied' | 'failed'

/** Copies `text` (computed on click, so it is always current) and says so, for sighted and screen-reader users. */
export function CopyButton({ label, getText, variant = 'primary' }: { label: string; getText: () => string; variant?: 'primary' | 'secondary' }) {
  const [status, setStatus] = useState<Status>('idle')

  useEffect(() => {
    if (status === 'idle') return
    const timer = window.setTimeout(() => setStatus('idle'), FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  const copy = async () => setStatus((await copyText(getText())) ? 'copied' : 'failed')

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button variant={variant} onClick={() => void copy()}>{label}</Button>
      <span role="status" className={status === 'failed' ? 'text-red-700' : 'text-green-800'}>
        {status === 'copied' && '¡Copiado!'}
        {status === 'failed' && 'No se pudo copiar: seleccioná el texto y copialo a mano.'}
      </span>
    </span>
  )
}
