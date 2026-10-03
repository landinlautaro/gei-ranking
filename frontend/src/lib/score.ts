// Instant, local feedback while typing a score. The API (preview endpoint) is the source of truth.

/** A completed set: 6-0..6-4, 7-5 or 7-6 for the winner. */
export function isValidSet(a: number, b: number): boolean {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return Number.isInteger(a) && Number.isInteger(b) && lo >= 0 && ((hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6)))
}

function isPointRace(a: number, b: number, target: number): boolean {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  if (!Number.isInteger(a) || !Number.isInteger(b) || lo < 0 || hi < target) return false
  return hi === target ? hi - lo >= 2 : hi - lo === 2
}

/** Tie-break of a 7-6 set: to 7, two points apart. */
export const isValidTieBreak = (a: number, b: number) => isPointRace(a, b, 7)

/** Deciding Super Tie-Break: to 10, two points apart. */
export const isValidSuperTieBreak = (a: number, b: number) => isPointRace(a, b, 10)

export const isSevenSix = (a: number, b: number) => Math.max(a, b) === 7 && Math.min(a, b) === 6

/** Parses an input value: empty or not a whole non-negative number gives null. */
export function parseCount(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** True when the two sets are split one each, which is when a Super Tie-Break is played. */
export function isSplit(set1: [number, number] | null, set2: [number, number] | null): boolean {
  if (!set1 || !set2) return false
  const first = set1[0] > set1[1]
  const second = set2[0] > set2[1]
  return first !== second
}
