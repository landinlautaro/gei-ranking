import { describe, expect, it } from 'vitest'
import { joinUrl } from './apiUrl'

describe('joinUrl', () => {
  it('sin base queda el mismo origen', () => {
    expect(joinUrl(undefined, '/api/ranking')).toBe('/api/ranking')
    expect(joinUrl('', '/photos/a.jpg')).toBe('/photos/a.jpg')
    expect(joinUrl('   ', '/api/ranking')).toBe('/api/ranking')
  })

  it('con base le antepone el origen de la API, sin barras de más', () => {
    expect(joinUrl('https://api.club.example', '/api/ranking')).toBe('https://api.club.example/api/ranking')
    expect(joinUrl('https://api.club.example/', '/photos/a.jpg')).toBe('https://api.club.example/photos/a.jpg')
    expect(joinUrl('https://api.club.example///', '/api/x')).toBe('https://api.club.example/api/x')
  })

  it('una URL absoluta se deja como está', () => {
    expect(joinUrl('https://api.club.example', 'https://cdn.example/foto.jpg')).toBe('https://cdn.example/foto.jpg')
  })
})
