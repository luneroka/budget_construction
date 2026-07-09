import { apiClient, apiPost } from './client'
import type { TokenRead } from './types'

export type LoginCredentials = {
  email: string
  password: string
}

export type ForgotPasswordRequest = {
  email: string
}

export type ForgotPasswordResponse = {
  message: string
}

export async function login(credentials: LoginCredentials): Promise<TokenRead> {
  const form = new URLSearchParams()
  form.set('username', credentials.email)
  form.set('password', credentials.password)

  const response = await apiClient.post<TokenRead>('/auth/login', form, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  return response.data
}

export async function forgotPassword(
  request: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> {
  return apiPost<ForgotPasswordResponse, ForgotPasswordRequest>(
    '/auth/forgot-password',
    request,
  )
}
