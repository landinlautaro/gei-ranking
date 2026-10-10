import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'

describe('ShareButton', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('con hoja de compartir del navegador, la abre con el título y el link', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    render(<ShareButton label="Compartir perfil" title="Juan · Ranking GEI" getUrl={() => 'https://gei.example/players/5'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Compartir perfil' }))

    expect(share).toHaveBeenCalledWith({ title: 'Juan · Ranking GEI', url: 'https://gei.example/players/5' })
  })

  it('si cierran la hoja de compartir no es un error', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(async () => { throw new DOMException('cancelado', 'AbortError') }), configurable: true })
    render(<ShareButton title="Ranking GEI" getUrl={() => 'https://gei.example/'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Compartir' }))

    expect(screen.queryByText(/No se pudo/)).not.toBeInTheDocument()
  })

  it('sin hoja de compartir copia el link', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareButton title="Ranking GEI" getUrl={() => 'https://gei.example/'} />)

    await userEvent.click(screen.getByRole('button', { name: 'Compartir (copiar link)' }))

    expect(writeText).toHaveBeenCalledWith('https://gei.example/')
    expect(await screen.findByText('¡Copiado!')).toBeInTheDocument()
  })
})
