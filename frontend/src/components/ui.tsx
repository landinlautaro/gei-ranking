import { cloneElement, isValidElement, useId, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react'

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:bg-slate-100 aria-[invalid=true]:border-red-500'

interface FieldProps {
  label: string
  error?: string
  hint?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}

/** Label + control + error/hint, wired for screen readers (the control gets the id and aria attributes). */
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {isValidElement(children) &&
        cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50'

const variants = {
  primary: 'bg-slate-900 text-white enabled:hover:bg-slate-700',
  secondary: 'border border-slate-300 bg-white text-slate-900 enabled:hover:bg-slate-100',
  danger: 'bg-red-700 text-white enabled:hover:bg-red-800',
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`${buttonBase} ${variants[variant]} ${className}`} {...props} />
}

const noticeTones = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-green-200 bg-green-50 text-green-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  error: 'border-red-200 bg-red-50 text-red-900',
} as const

export function Notice({ tone = 'info', children, live }: { tone?: keyof typeof noticeTones; children: ReactNode; live?: boolean }) {
  return (
    <div role={live ? (tone === 'error' ? 'alert' : 'status') : undefined} className={`rounded-lg border p-3 text-sm ${noticeTones[tone]}`}>
      {children}
    </div>
  )
}

interface ConfirmButtonProps {
  label: string
  question: string
  confirmLabel: string
  onConfirm: () => void
  variant?: keyof typeof variants
  disabled?: boolean
}

/** Two steps for destructive actions, without a modal: first the button, then an explicit "yes". */
export function ConfirmButton({ label, question, confirmLabel, onConfirm, variant = 'secondary', disabled }: ConfirmButtonProps) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <Button variant={variant} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    )
  }

  return (
    <div role="group" aria-label={question} className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2">
      <span className="text-sm text-red-900">{question}</span>
      <Button
        variant="danger"
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="secondary" onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </div>
  )
}
