import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-slate-700">{children}</ul>
    </section>
  )
}

export function RulesPage() {
  useDocumentTitle('Reglamento')
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Reglamento</h1>
      <p className="mt-2 text-slate-600">
        Ranking interno de tenis: una escalera por desafíos para competir, jugar entre nosotros y darle movimiento a la
        actividad durante todo el año.
      </p>

      <Section title="Desafíos">
        <li>El ranking está compuesto por todos los jugadores participantes, ordenados del 1 en adelante.</li>
        <li>Podés desafiar únicamente a un jugador que esté hasta 5 puestos por encima tuyo. Ejemplo: si estás #20, podés desafiar del #15 al #19.</li>
        <li>No se puede desafiar hacia abajo.</li>
        <li>Para desafiar, mandás en el grupo: «Desafío #20 vs #17».</li>
        <li>Una vez realizado el desafío, el jugador desafiado tiene 7 días para aceptar y jugar el partido.</li>
      </Section>

      <Section title="Cambio de posiciones">
        <li>Si gana el desafiante, intercambia su posición con el desafiado. Ejemplo: el #20 le gana al #17 y pasa a ser #17; el #17 pasa a #20.</li>
        <li>Si gana el desafiado, sube 1 puesto. Ejemplo: el #17 defiende y pasa a #16; el #16 baja a #17.</li>
        <li>Si el desafiado es el #1 y gana, no hay movimiento.</li>
      </Section>

      <Section title="Formato del partido">
        <li>Al mejor de 3 sets, con ventaja.</li>
        <li>Sets válidos para el ganador del set: 6-0, 6-1, 6-2, 6-3, 6-4, 7-5 y 7-6.</li>
        <li>Si se llega a un tercer set, se juega un Super Tie-Break a 10 puntos, con diferencia de 2 (10-8, 11-9, 12-10…).</li>
      </Section>

      <Section title="Resultados">
        <li>Una vez terminado el partido, se informa el resultado por el grupo.</li>
        <li>El administrador carga el resultado y el ranking se actualiza automáticamente.</li>
      </Section>

      <Section title="Casos especiales">
        <li>W.O.: gana el rival sin score y el ranking se mueve igual que en un partido jugado.</li>
        <li>Abandono: se carga el score parcial, el administrador indica el ganador y el ranking se mueve como en un partido normal.</li>
        <li>El rango de 5 puestos se evalúa con las posiciones vigentes a la fecha del partido.</li>
        <li>Si vence el plazo de 7 días, no se aplica nada automáticamente: el administrador decide y, si corresponde, carga un W.O.</li>
        <li>Un jugador nuevo entra en la última posición, salvo que el administrador indique otra.</li>
        <li>Si un jugador se da de baja, los que estaban debajo suben un puesto y su historial se conserva.</li>
        <li>No hay límite de desafíos simultáneos, ni restricción de revancha, ni penalización por inactividad.</li>
      </Section>

      <Link to="/" className="mt-8 inline-block text-sky-700 underline">Ver el ranking</Link>
    </div>
  )
}
