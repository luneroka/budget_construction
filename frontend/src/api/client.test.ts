import {
  type AxiosAdapter,
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'

import {
  type ApiErrorBody,
  apiClient,
  getApiErrorMessage,
  hasPendingWrites,
  setApiRefreshHandler,
} from './client'

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

// Stands in for the network: each request gets the next status in `statuses`
// once the test calls `answer()`, and `hasStarted` resolves when it is sent.
function heldNetwork(statuses: number[]) {
  const pending: Array<() => void> = []
  let signalStarted = () => {}
  const hasStarted = new Promise<void>((resolve) => {
    signalStarted = resolve
  })

  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) =>
    new Promise((resolve, reject) => {
      const status = statuses.shift() ?? 200
      const response = {
        data: null,
        status,
        statusText: '',
        headers: {},
        config,
      }
      pending.push(() =>
        status < 400
          ? resolve(response)
          : reject(new AxiosError('Failed', undefined, config, null, response)),
      )
      signalStarted()
    })

  return {
    adapter,
    hasStarted,
    answer: () => pending.shift()?.(),
  }
}

describe('hasPendingWrites', () => {
  afterEach(() => {
    setApiRefreshHandler(null)
  })

  it('counts a write until it is answered', async () => {
    const network = heldNetwork([201])
    const request = apiClient.post(
      '/projects/',
      {},
      { adapter: network.adapter },
    )
    await network.hasStarted
    expect(hasPendingWrites()).toBe(true)

    network.answer()
    await request
    expect(hasPendingWrites()).toBe(false)
  })

  it('counts a write until it fails', async () => {
    const network = heldNetwork([500])
    const request = apiClient.delete('/projects/1', {
      adapter: network.adapter,
    })
    await network.hasStarted
    expect(hasPendingWrites()).toBe(true)

    network.answer()
    await expect(request).rejects.toThrow()
    expect(hasPendingWrites()).toBe(false)
  })

  it('leaves reads out', async () => {
    const network = heldNetwork([200])
    const request = apiClient.get('/projects/', { adapter: network.adapter })
    await network.hasStarted
    expect(hasPendingWrites()).toBe(false)

    network.answer()
    await request
  })

  it('settles a write retried after a token refresh', async () => {
    setApiRefreshHandler(async () => 'renewed-token')
    let calls = 0
    const adapter: AxiosAdapter = async (config) => {
      calls += 1
      const status = calls === 1 ? 401 : 204
      const response = {
        data: null,
        status,
        statusText: '',
        headers: {},
        config,
      }
      if (status === 401) {
        throw new AxiosError('Unauthorized', undefined, config, null, response)
      }
      return response
    }

    await apiClient.patch('/projects/1', {}, { adapter })
    expect(calls).toBe(2)
    expect(hasPendingWrites()).toBe(false)
  })
})
