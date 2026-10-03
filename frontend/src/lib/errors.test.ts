import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { describeError, fieldErrors, messageForCode } from './errors'

describe('messageForCode', () => {
  it('traduce los códigos de score', () => {
    expect(messageForCode('MissingSuperTieBreak')).toMatch(/Super Tie-Break/)
    expect(messageForCode('InvalidSet')).toMatch(/6-0, 6-1/)
  })

  it('no inventa: muestra el código si no lo conoce', () => {
    expect(messageForCode('Whatever')).toBe('Error (Whatever).')
  })
})

describe('describeError', () => {
  it('prioriza el código del problema', () => {
    expect(describeError(new ApiError('x', 409, 'OutOfRangeConfirmationRequired'))).toMatch(/fuera de rango/)
  })

  it('cae al primer error de campo', () => {
    expect(describeError(new ApiError('x', 422, 'ValidationFailed', { fullName: ['Required'] }))).toBe('Es obligatorio.')
  })

  it('distingue credenciales incorrectas de sesión vencida', () => {
    expect(describeError(new ApiError('x', 401, 'InvalidCredentials'))).toBe('Usuario o contraseña incorrectos.')
    expect(describeError(new ApiError('x', 401))).toMatch(/sesión venció/)
  })

  it('avisa de demasiados intentos y de falta de conexión', () => {
    expect(describeError(new ApiError('x', 429))).toMatch(/Demasiados intentos/)
    expect(describeError(new ApiError('No se pudo conectar con el servidor.', null))).toBe('No se pudo conectar con el servidor.')
  })

  it('maneja errores que no son de la API', () => {
    expect(describeError(new Error('boom'))).toBe('Ocurrió un error inesperado.')
  })
})

describe('fieldErrors', () => {
  it('devuelve un mensaje por campo', () => {
    const error = new ApiError('x', 422, 'ValidationFailed', { score: ['InvalidSet', 'InvalidTieBreak'], notes: [] })

    const result = fieldErrors(error)

    expect(Object.keys(result)).toEqual(['score'])
    expect(result.score).toMatch(/set inválido/)
  })

  it('devuelve vacío para errores ajenos', () => {
    expect(fieldErrors(new Error('x'))).toEqual({})
  })
})
