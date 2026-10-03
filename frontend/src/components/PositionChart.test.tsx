import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PositionChart } from './PositionChart'

const until = new Date('2026-04-01T00:00:00Z')

describe('PositionChart', () => {
  it('dibuja un marcador por cambio y ofrece la misma data como tabla', () => {
    const { container } = render(
      <PositionChart
        until={until}
        points={[
          { at: '2026-01-01T12:00:00Z', position: 8 },
          { at: '2026-02-01T12:00:00Z', position: 5 },
          { at: '2026-03-01T12:00:00Z', position: 6 },
        ]}
      />,
    )

    expect(container.querySelectorAll('circle')).toHaveLength(3)
    expect(container.querySelectorAll('path')).toHaveLength(1)

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual(['01/01/2026#8', '01/02/2026#5', '01/03/2026#6'])
  })

  it('describe la evolución para lectores de pantalla', () => {
    render(
      <PositionChart
        until={until}
        points={[
          { at: '2026-01-01T12:00:00Z', position: 8 },
          { at: '2026-02-01T12:00:00Z', position: 5 },
        ]}
      />,
    )

    expect(screen.getByRole('group', { name: /Evolución/ })).toHaveAccessibleName(/de #8 a #5, mejor posición #5/)
  })

  it('recorre los cambios con las flechas y muestra el detalle', () => {
    render(
      <PositionChart
        until={until}
        points={[
          { at: '2026-01-01T12:00:00Z', position: 8 },
          { at: '2026-02-01T12:00:00Z', position: 5 },
        ]}
      />,
    )
    const chart = screen.getByRole('group', { name: /Evolución/ })

    fireEvent.focus(chart)
    expect(screen.getByRole('status')).toHaveTextContent('#501/02/2026')

    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(screen.getByRole('status')).toHaveTextContent('#801/01/2026')

    fireEvent.blur(chart)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('funciona con un solo punto', () => {
    const { container } = render(<PositionChart until={until} points={[{ at: '2026-01-01T12:00:00Z', position: 12 }]} />)

    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('corta la línea cuando el jugador sale del ranking y la retoma al volver', () => {
    const { container } = render(
      <PositionChart
        until={until}
        points={[
          { at: '2026-01-01T12:00:00Z', position: 8 },
          { at: '2026-02-01T12:00:00Z', position: null },
          { at: '2026-03-01T12:00:00Z', position: 20 },
        ]}
      />,
    )

    expect(container.querySelectorAll('path')).toHaveLength(2)
    expect(container.querySelectorAll('circle')).toHaveLength(2)
    expect(screen.getByText('Fuera del ranking')).toBeInTheDocument()
  })

  it('sin historial muestra un aviso', () => {
    render(<PositionChart points={[]} />)

    expect(screen.getByText('Todavía no hay historial de posiciones.')).toBeInTheDocument()
  })
})
