import { ApiError } from '../api/client'

/** Spanish text for the codes the API sends (field errors and problem codes). */
const messages: Record<string, string> = {
  // fields
  Required: 'Es obligatorio.',
  TooLong: 'Es demasiado largo.',
  MustBePositive: 'Tiene que ser 1 o más.',
  SamePlayer: 'El desafiante y el desafiado no pueden ser la misma persona.',
  PlayerNotFound: 'No se encontró al jugador.',
  DateInFuture: 'La fecha no puede ser futura.',
  OutOfBounds: 'Esa posición no existe en el ranking.',
  SamePosition: 'El jugador ya está en esa posición.',
  InvalidPaging: 'Paginación inválida.',
  // score
  InvalidSetCount: 'Cargá los dos sets.',
  InvalidSet: 'Hay un set inválido. Resultados posibles: 6-0, 6-1, 6-2, 6-3, 6-4, 7-5 o 7-6.',
  InvalidTieBreak: 'El tie-break no es válido: es a 7 puntos con diferencia de 2 y solo existe en un 7-6.',
  MissingSuperTieBreak: 'Con un set para cada uno hay que cargar el Super Tie-Break.',
  UnexpectedSuperTieBreak: 'No corresponde Super Tie-Break: ya hay un ganador en dos sets.',
  InvalidSuperTieBreak: 'El Super Tie-Break es a 10 puntos con diferencia de 2 (10-8, 11-9…).',
  ScoreNotAllowed: 'Un W.O. no lleva resultado.',
  WinnerRequired: 'Indicá quién ganó.',
  InvalidPartialScore: 'El resultado parcial no es válido (hasta 2 sets, de 0 a 7 games).',
  // photo
  TooLarge: 'La foto pesa más de 5 MB.',
  UnsupportedFormat: 'Formato no soportado: usá una foto JPEG, PNG o WebP.',
  UnreadableImage: 'No se pudo leer la imagen.',
  // ranking warnings
  OutOfRange: 'Fuera de rango: el desafío es de más de 5 puestos o hacia abajo.',
  PlayerNotRanked: 'Uno de los jugadores no estaba en el ranking en esa fecha.',
  InvalidWinner: 'El ganador no es uno de los dos jugadores.',
  PlayerAlreadyRanked: 'El jugador ya estaba en el ranking.',
  // problems
  InvalidCredentials: 'Usuario o contraseña incorrectos.',
  OutOfRangeConfirmationRequired: 'El desafío está fuera de rango. Confirmá que querés guardarlo igual.',
  MatchNotApplicable: 'Ese partido no se puede aplicar al ranking.',
  MatchVoided: 'Un partido anulado no se puede editar.',
  PlayerNotInRanking: 'El jugador no está en el ranking.',
  AlreadyInactive: 'El jugador ya está dado de baja.',
  AlreadyActive: 'El jugador ya está activo.',
  NotFound: 'No encontramos lo que buscás.',
  ValidationFailed: 'Revisá los datos ingresados.',
}

export function messageForCode(code: string): string {
  return messages[code] ?? `Error (${code}).`
}

/** One readable sentence for any error thrown by the API layer. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado.'
  if (error.status === 429) return 'Demasiados intentos. Esperá un minuto y volvé a probar.'
  if (error.status === null) return error.message
  if (error.status === 401) return error.code === 'InvalidCredentials' ? messageForCode(error.code) : 'Tu sesión venció. Volvé a ingresar.'
  if (error.code && error.code !== 'ValidationFailed' && messages[error.code]) return messages[error.code]
  const first = Object.values(error.errors).flat()[0]
  if (first) return messageForCode(first)
  return error.message
}

/** Field name -> first message, for showing errors next to inputs. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  return Object.fromEntries(
    Object.entries(error.errors)
      .filter(([, codes]) => codes.length > 0)
      .map(([field, codes]) => [field, codes.map(messageForCode).join(' ')]),
  )
}
