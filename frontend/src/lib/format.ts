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
    completed: 'Termine',
    archived: 'Archive',
  }

  return labels[status] ?? status
}
