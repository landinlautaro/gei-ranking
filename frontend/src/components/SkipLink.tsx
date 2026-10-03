/** First tab stop on every page: lets keyboard users jump over the navigation. Hidden until focused. */
export function SkipLink() {
  return (
    <a
      href="#contenido"
      className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
    >
      Saltar al contenido
    </a>
  )
}
