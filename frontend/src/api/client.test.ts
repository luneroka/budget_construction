import { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'

import { type ApiErrorBody, getApiErrorMessage } from './client'

function apiError(
  status: number,
  data?: ApiErrorBody,
): AxiosError<ApiErrorBody> {
  const response = { status, data } as AxiosResponse<ApiErrorBody>
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    response,
  )
}

describe('getApiErrorMessage', () => {
  it('translates a known error code', () => {
    expect(
      getApiErrorMessage(
        apiError(404, { detail: { code: 'project_not_found' } }),
      ),
    ).toBe('Ce projet est introuvable.')
  })

  it('falls back to the server message for an unknown code', () => {
    expect(
      getApiErrorMessage(
        apiError(400, {
          detail: { code: 'mystery', message: 'Mystery error' },
        }),
      ),
    ).toBe('Mystery error')
  })

  it('summarises field validation errors', () => {
    expect(
      getApiErrorMessage(
        apiError(422, {
          detail: {
            code: 'request_validation_failed',
            context: { errors: [{ field: 'email', message: 'invalid' }] },
          },
        }),
      ),
    ).toBe('Certains champs sont invalides.')
  })

  it('maps a bare status code when the body carries nothing usable', () => {
    expect(getApiErrorMessage(apiError(429))).toBe(
      'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
    )
    expect(getApiErrorMessage(apiError(413))).toBe(
      'Le fichier est trop volumineux (max. 20 Mo).',
    )
  })

  it('reports a network failure when there is no response at all', () => {
    expect(getApiErrorMessage(new AxiosError('Network Error'))).toBe(
      'Impossible de joindre le serveur. Vérifiez votre connexion.',
    )
  })

  it('passes through the message of a plain Error', () => {
    expect(getApiErrorMessage(new Error('Identifiant projet manquant.'))).toBe(
      'Identifiant projet manquant.',
    )
  })
})
