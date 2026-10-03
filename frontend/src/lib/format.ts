import type { PlayerProfile } from '../api/types'

const CLUB_TIME_ZONE = 'America/Argentina/Buenos_Aires'

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  timeZone: CLUB_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** dd/mm/aaaa in club local time. */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

/** Lowercase without accents, to search "gaston" and find "Gastón". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${Math.abs(count) === 1 ? one : many}`
}

export function movementDescription(movement: number): string {
  if (movement > 0) return `Subió ${plural(movement, 'puesto', 'puestos')}`
  if (movement < 0) return `Bajó ${plural(-movement, 'puesto', 'puestos')}`
  return 'Sin cambios de posición'
}

export function streakDescription(streak: number): string {
  if (streak > 0) return `${plural(streak, 'victoria', 'victorias')} seguidas`
  if (streak < 0) return `${plural(-streak, 'derrota', 'derrotas')} seguidas`
  return '—'
}

export function percentage(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}

export const handLabel: Record<NonNullable<PlayerProfile['hand']>, string> = {
  RightHanded: 'Diestro',
  LeftHanded: 'Zurdo',
}

export const backhandLabel: Record<NonNullable<PlayerProfile['backhand']>, string> = {
  OneHanded: 'Revés a una mano',
  TwoHanded: 'Revés a dos manos',
}
