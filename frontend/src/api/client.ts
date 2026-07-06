import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

import { apiConfig } from './config'

export type ApiErrorBody = {
  detail?: string | Array<Record<string, unknown>> | Record<string, unknown>
}

let accessToken: string | null = null

export function setApiAccessToken(token: string | null) {
  accessToken = token
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

export async function apiGet<TResponse>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<TResponse> {
  const response = await apiClient.get<TResponse>(url, config)
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

  return error.message
}

export type ApiError = AxiosError<ApiErrorBody>
