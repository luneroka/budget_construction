import type { SyntheticEvent } from 'react'

export const documentInputAccept =
  'application/pdf,image/jpeg,image/png,image/heic,.pdf,.jpg,.jpeg,.png,.heic'

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function getSelectedFile(event: SyntheticEvent<HTMLInputElement>) {
  return event.currentTarget.files?.[0] ?? null
}
