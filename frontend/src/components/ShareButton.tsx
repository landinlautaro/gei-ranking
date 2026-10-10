import { CopyButton } from './CopyButton'
import { Button } from './ui'

/**
 * "Compartir": opens the phone's share sheet (WhatsApp included) when the browser has one; otherwise it copies the link.
 * `title` is the share-sheet heading and `getUrl` is read on click so it is always the current page.
 */
export function ShareButton({ label = 'Compartir', title, getUrl = () => window.location.href }: { label?: string; title: string; getUrl?: () => string }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const share = async () => {
      try {
        await navigator.share({ title, url: getUrl() })
      } catch {
        // The person closed the share sheet: nothing to report.
      }
    }
    return <Button variant="secondary" onClick={() => void share()}>{label}</Button>
  }

  return <CopyButton label={`${label} (copiar link)`} variant="secondary" getText={getUrl} />
}
