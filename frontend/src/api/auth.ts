import { apiClient } from './client'
import type { TokenRead } from './types'

export type LoginCredentials = {
  email: string
  password: string
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
