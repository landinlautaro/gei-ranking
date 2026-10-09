import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'

interface RulesSection {
  title: string
  paragraphs?: string[]
  items?: string[]
  afterItems?: string[]
}

// Reglamento oficial, versión 2. Para publicar una nueva versión, actualizar RULES_VERSION y las secciones.
const RULES_VERSION = 2

const SECTIONS: RulesSection[] = [
  {
    title: 'Objetivo',
    paragraphs: [
      'El presente reglamento tiene como objetivo organizar y mantener un ranking interno de tenis entre los jugadores participantes, promoviendo la competencia, la continuidad de los partidos y el orden en la coordinación de los desafíos.',
    ],
  },
  {
    title: 'Publicación del ranking',
    paragraphs: [
      'El ranking será actualizado y publicado por el coordinador semanalmente todos los lunes por la mañana en el grupo de WhatsApp correspondiente.',
      'La clasificación publicada el lunes será la referencia para los desafíos de esa semana.',
    ],
  },
  {
    title: 'Período para realizar desafíos',
    paragraphs: [
      'Los jugadores podrán realizar e iniciar desafíos desde el lunes, una vez publicado el ranking, hasta el miércoles inclusive de esa misma semana.',
      'El desafío podrá realizarse el mismo lunes y, si los jugadores lo coordinan, el partido podrá disputarse de inmediato (por ejemplo, coordinar, jugarlo y pasar el resultado el mismo lunes).',
      'Si los jugadores juegan el partido antes del miércoles y pasan el resultado, se da por cumplido su desafío semanal y no tienen que realizar ni recibir otro desafío durante esa semana.',
      'El miércoles será el último día para iniciar un nuevo desafío correspondiente a esa semana.',
    ],
  },
  {
    title: 'Plazo para jugar y comunicar el resultado',
    paragraphs: [
      'Los desafíos realizados durante la semana deberán ser coordinados entre los jugadores y disputados dentro del período correspondiente, contando con toda la semana, incluido el fin de semana, para jugarlo.',
      'Como fecha límite, el resultado deberá ser informado en el grupo de WhatsApp hasta el domingo inclusive.',
      'El coordinador realizará el seguimiento de los desafíos y podrá consultar a los jugadores involucrados para verificar que los partidos hayan sido coordinados y/o disputados.',
    ],
  },
  {
    title: 'Sistema de desafíos',
    items: [
      'Se permite jugar únicamente un (1) desafío o partido por semana en el ranking por jugador.',
      'Un jugador podrá desafiar únicamente a otro jugador que se encuentre hasta cinco (5) posiciones por encima de su puesto en el ranking.',
      'No se permiten desafíos hacia jugadores que estén por debajo del desafiante.',
      'El desafío queda automáticamente aceptado desde el momento en que es comunicado.',
      'Una vez aceptado el desafío, ambos jugadores deberán ponerse de acuerdo para coordinar día y horario.',
      'Si los jugadores no logran coordinar el partido, deberán comunicarlo al coordinador con la mayor anticipación posible.',
      'Una vez coordinado el partido, los jugadores podrán informar la fecha y horario en el grupo de WhatsApp. El coordinador podrá retirarlos de la lista de desafíos activos para evitar nuevos recordatorios o menciones.',
    ],
  },
  {
    title: 'Formato de los partidos',
    paragraphs: ['Los partidos se disputarán bajo el siguiente formato:'],
    items: [
      'Al mejor de tres (3) sets.',
      'Los dos primeros sets se juegan con ventaja.',
      'En caso de quedar un set por lado, el tercer set se reemplaza por un Super Tie-Break a 10 puntos.',
      'El Super Tie-Break deberá ganarse por una diferencia mínima de dos (2) puntos.',
    ],
    afterItems: [
      'Este formato busca mantener un sistema similar al utilizado en competencias de interclubes/asociación, adaptado a la dinámica del ranking interno.',
    ],
  },
  {
    title: 'Resultado y movimiento en el ranking',
    paragraphs: [
      'Si el desafiante gana el partido, intercambia su posición con el jugador desafiado, ocupando la posición que tenía el desafiado.',
      'Si el jugador desafiado gana el partido, avanza una (1) posición en el ranking. El desafiante mantiene la posición que tenía antes del partido.',
    ],
  },
  {
    title: 'Lesiones, vacaciones y viajes',
    paragraphs: [
      'Si un jugador se encuentra lesionado, de vacaciones, realizando un viaje de trabajo o atraviesa otra situación que le impida jugar durante el período correspondiente, deberá comunicarlo al coordinador con anticipación, siempre que sea posible.',
      'El coordinador podrá colocar al jugador en estado INACTIVO durante el período informado, evitando que reciba desafíos mientras dure dicha situación.',
      'Cuando corresponda, el coordinador podrá realizar el ajuste necesario de su posición en el ranking para mantener el sistema activo y permitir que los demás jugadores continúen desafiándose.',
      'La situación deberá comunicarse con tiempo y no después de vencido el plazo del desafío, salvo casos de fuerza mayor.',
    ],
  },
  {
    title: 'Imposibilidad de coordinar un partido',
    paragraphs: [
      'Si un jugador tiene un inconveniente que le impide cumplir con el desafío, deberá comunicarlo al coordinador antes de que finalice el plazo.',
      'El coordinador evaluará la situación y podrá:',
    ],
    items: [
      'dejar el desafío pendiente;',
      'declarar al jugador temporalmente inactivo;',
      'reprogramar el partido;',
      'permitir que el desafiante continúe participando de la ronda de desafíos;',
      'realizar el ajuste de ranking que corresponda.',
    ],
    afterItems: ['El objetivo es evitar que la falta de disponibilidad de un jugador bloquee el movimiento del resto del ranking.'],
  },
  {
    title: 'Inactividad',
    paragraphs: [
      'El ranking busca que los jugadores se mantengan activos. Por ese motivo, la falta prolongada de participación podrá ser considerada por el coordinador para colocar a un jugador en estado INACTIVO y/o modificar su posición.',
      'La condición de inactividad será determinada por el coordinador teniendo en cuenta la participación del jugador, los desafíos recibidos o realizados y las situaciones personales previamente comunicadas.',
      'La activación nuevamente del jugador se realizará cuando se encuentre disponible para participar de los desafíos.',
    ],
  },
  {
    title: 'Comunicación y buena conducta',
    paragraphs: [
      'Todos los jugadores deberán mantener una comunicación respetuosa y colaborar para que los partidos puedan realizarse dentro de los plazos establecidos.',
      'Los horarios y lugares de juego deberán ser acordados entre los jugadores. Ante cualquier dificultad, desacuerdo o inconveniente que impida la realización del partido, deberán comunicarse con el coordinador antes de que finalice el plazo.',
      'El resultado de cada partido deberá ser informado en el grupo de WhatsApp para que pueda ser registrado y utilizado en la actualización del ranking.',
    ],
  },
  {
    title: 'Rol del coordinador',
    paragraphs: [
      'El coordinador será responsable de publicar semanalmente el ranking, organizar y controlar el sistema de desafíos, registrar los resultados y actualizar las posiciones.',
      'También tendrá la facultad de resolver situaciones no contempladas expresamente en este reglamento, procurando siempre mantener la igualdad de condiciones, la continuidad de los partidos y el correcto funcionamiento del ranking.',
    ],
  },
  {
    title: 'Vigencia y modificaciones',
    paragraphs: [
      'El presente reglamento entra en vigencia a partir de su publicación en el grupo de WhatsApp.',
      'Cualquier modificación necesaria para mejorar el funcionamiento del ranking podrá ser incorporada por el coordinador y comunicada previamente a los jugadores.',
    ],
  },
]

export function RulesPage() {
  useDocumentTitle('Reglamento')
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-slate-500">Versión {RULES_VERSION}</p>
      <h1 className="text-2xl font-bold">Reglamento – Ranking interno de tenis</h1>
      <p className="mt-1 text-slate-600">Club Gimnasia y Esgrima de Ituzaingó (GEI) · Sistema de desafíos semanales</p>

      {SECTIONS.map((section, index) => (
        <section key={section.title} className="mt-6">
          <h2 className="text-lg font-semibold">
            {index + 1}. {section.title}
          </h2>
          <div className="mt-2 space-y-2 text-slate-700">
            {section.paragraphs?.map((text) => <p key={text}>{text}</p>)}
            {section.items && (
              <ul className="list-disc space-y-1.5 pl-5">
                {section.items.map((text) => <li key={text}>{text}</li>)}
              </ul>
            )}
            {section.afterItems?.map((text) => <p key={text}>{text}</p>)}
          </div>
        </section>
      ))}

      <p className="mt-8 text-sm font-medium text-slate-600">Coordinación de Tenis – GEI</p>
      <Link to="/" className="mt-4 inline-block text-sky-700 underline">Ver el ranking</Link>
    </div>
  )
}
