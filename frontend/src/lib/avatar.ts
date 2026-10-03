interface Variant {
  court: string
  skin: string
  hair: string
  hairStyle: 'short' | 'curly' | 'buzz' | 'bald'
  headwear: 'headband' | 'cap' | 'visor' | 'none'
  accent: string
  shirt: string
  racketSide: 1 | -1
  beard?: boolean
}

// All male tennis players with a racket; they differ in the details.
const variants: readonly Variant[] = [
  { court: '#c8643c', skin: '#e8b48a', hair: '#4a2f1d', hairStyle: 'short', headwear: 'headband', accent: '#e63946', shirt: '#ffffff', racketSide: 1 },
  { court: '#4f8a5b', skin: '#f5d0b0', hair: '#c9a24a', hairStyle: 'short', headwear: 'cap', accent: '#1d3557', shirt: '#f4d35e', racketSide: -1 },
  { court: '#3b6fb6', skin: '#9b6643', hair: '#1f1a17', hairStyle: 'curly', headwear: 'none', accent: '#ffffff', shirt: '#e63946', racketSide: 1 },
  { court: '#8fb3d9', skin: '#c98f65', hair: '#1f1a17', hairStyle: 'buzz', headwear: 'visor', accent: '#2a9d8f', shirt: '#1d3557', racketSide: -1, beard: true },
  { court: '#d9a441', skin: '#f5d0b0', hair: '#8d8d8d', hairStyle: 'short', headwear: 'none', accent: '#ffffff', shirt: '#2a9d8f', racketSide: 1, beard: true },
  { court: '#c8643c', skin: '#6e4429', hair: '#1f1a17', hairStyle: 'bald', headwear: 'headband', accent: '#f4d35e', shirt: '#ffffff', racketSide: -1 },
  { court: '#4f8a5b', skin: '#e8b48a', hair: '#b5472b', hairStyle: 'curly', headwear: 'cap', accent: '#e63946', shirt: '#f2f2f2', racketSide: 1 },
  { court: '#3b6fb6', skin: '#c98f65', hair: '#4a2f1d', hairStyle: 'short', headwear: 'visor', accent: '#f4d35e', shirt: '#ff8c42', racketSide: -1 },
]

const cache = new Map<number, string>()

function draw(v: Variant): string {
  const side = v.racketSide
  const hair =
    v.hairStyle === 'bald'
      ? ''
      : v.hairStyle === 'buzz'
        ? `<path d="M21.5 27 Q21 15.5 32 15.5 Q43 15.5 42.5 27 Q38 22.5 32 22.5 Q26 22.5 21.5 27 Z" fill="${v.hair}" fill-opacity=".85"/>`
        : v.hairStyle === 'curly'
          ? [21, 26, 32, 38, 43].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 17 : 19}" r="5.5" fill="${v.hair}"/>`).join('')
          : `<path d="M21 28 Q20 15 32 15 Q44 15 43 28 Q38 21 32 21 Q26 21 21 28 Z" fill="${v.hair}"/>`

  const headwear =
    v.headwear === 'headband'
      ? `<rect x="21" y="20.5" width="22" height="4" rx="1.5" fill="${v.accent}"/>`
      : v.headwear === 'cap'
        ? `<path d="M21 24 Q21 12 32 12 Q43 12 43 24 Z" fill="${v.accent}"/><path d="M30 24 L50 24 Q50 27 44 27 L30 27 Z" fill="${v.accent}"/>`
        : v.headwear === 'visor'
          ? `<path d="M21 23 L43 23 L49 26 Q40 28 21 27 Z" fill="${v.accent}"/>`
          : ''

  const beard = v.beard
    ? `<path d="M22 31 Q22 42 32 42 Q42 42 42 31 Q38 38 32 38 Q26 38 22 31 Z" fill="${v.hair}"/>`
    : ''

  const racket =
    `<g transform="translate(${side === 1 ? 50 : 14} 44) rotate(${side * 28})">` +
    `<rect x="-1.2" y="0" width="2.4" height="12" rx="1" fill="#2b2b2b"/>` +
    `<ellipse cx="0" cy="-9" rx="7" ry="9.5" fill="none" stroke="#2b2b2b" stroke-width="2"/>` +
    `<path d="M-5 -9 H5 M-3.5 -14 H3.5 M-3.5 -4 H3.5 M0 -18 V0 M-3 -17 V-1 M3 -17 V-1" stroke="#ffffff" stroke-opacity=".7" stroke-width=".6"/>` +
    `</g>`

  const bx = side === 1 ? 13 : 51
  const ball =
    `<circle cx="${bx}" cy="14" r="4" fill="#d8e84a"/>` +
    `<path d="M${bx - 3} 12.5 Q${bx} 15 ${bx + 3} 12.5" stroke="#fff" stroke-width=".9" fill="none"/>`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" fill="${v.court}"/>` +
    `<path d="M0 54 L64 54 M32 54 V64" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2"/>` +
    ball +
    racket +
    `<path d="M10 64 Q12 47 32 47 Q52 47 54 64 Z" fill="${v.shirt}"/>` +
    `<path d="M26 47 Q32 54 38 47" fill="${v.skin}"/>` +
    `<rect x="28.5" y="38" width="7" height="10" fill="${v.skin}"/>` +
    `<ellipse cx="32" cy="29" rx="11" ry="12" fill="${v.skin}"/>` +
    beard +
    hair +
    headwear +
    `<circle cx="27.5" cy="29" r="1.3" fill="#2b2b2b"/><circle cx="36.5" cy="29" r="1.3" fill="#2b2b2b"/>` +
    `<path d="M27 34 Q32 38 37 34" stroke="${v.beard ? '#ffffff' : '#2b2b2b'}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
    `</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Same player id, same avatar, always: one of a few male tennis players with a racket. Drawn locally, no external service. */
export function avatarUri(playerId: number): string {
  let uri = cache.get(playerId)
  if (!uri) {
    uri = draw(variants[Math.abs(playerId) % variants.length])
    cache.set(playerId, uri)
  }
  return uri
}
