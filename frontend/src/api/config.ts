export const apiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  enableReadQueries: import.meta.env.VITE_ENABLE_API_READS === 'true',
}
