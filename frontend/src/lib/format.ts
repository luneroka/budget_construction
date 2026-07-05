export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatProjectStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Brouillon',
    active: 'Actif',
    completed: 'Terminé',
    archived: 'Archivé',
  }

  return labels[status] ?? status
}

export function formatMonth(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    year: '2-digit',
  }).format(new Date(`${value}-01T00:00:00`))
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-'

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`

  const units = ['Ko', 'Mo', 'Go']
  let size = bytes / 1024
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: size >= 10 ? 0 : 1,
  }).format(size)} ${units[unitIndex]}`
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatProgress(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(100, Math.max(0, (value / max) * 100))
}
