const ACCESS_TOKEN_STORAGE_KEY = 'budget-construction:access-token'

export function getStoredAccessToken() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
}

export function storeAccessToken(token: string) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
}

export function clearStoredAccessToken() {
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
}
