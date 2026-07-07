import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

import { apiConfig } from './config'

export type ApiErrorBody = {
  detail?: string | Array<Record<string, unknown>> | Record<string, unknown>
}

let accessToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export function setApiAccessToken(token: string | null) {
  accessToken = token
}

export function setApiUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export const apiClient = axios.create({
  baseURL: apiConfig.baseUrl,
  headers: {
    Accept: 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      unauthorizedHandler?.()
    }

    return Promise.reject(error)
  },
)

export async function apiGet<TResponse>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.get<TResponse>(url, config)
  return response.data
}

export async function apiPost<TResponse, TBody = unknown>(
  url: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.post<TResponse>(url, body, config)
  return response.data
}

export async function apiPatch<TResponse, TBody = unknown>(
  url: string,
  body: TBody,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.patch<TResponse>(url, body, config)
  return response.data
}

export async function apiDelete<TResponse = void>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.delete<TResponse>(url, config)
  return response.data
}

export function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return 'Unexpected API error'
  }

  const detail = error.response?.data?.detail

  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => item.msg)
      .filter((message): message is string => typeof message === 'string')

    if (messages.length > 0) {
      return messages.join(' ')
    }
  }

  if (
    detail &&
    !Array.isArray(detail) &&
    typeof detail.message === 'string'
  ) {
    return detail.message
  }

  return error.message
}

export type ApiError = AxiosError<ApiErrorBody>
