import { Badge, type BadgeVariant } from '@/components/ui/badge'

type StatusBadgeProps = {
  status: string
  disabled?: boolean
}

const statusVariants: Record<string, BadgeVariant> = {
  draft: 'muted',
  active: 'accent',
  completed: 'success',
  archived: 'muted',
  quote: 'accent',
  diy_estimate: 'accent',
  invoice: 'default',
  rib: 'gold',
  to_confirm: 'warning',
  to_negotiate: 'gold',
  validated: 'success',
  rejected: 'secondary',
  unpaid: 'warning',
  on_hold: 'warning',
  paid: 'success',
  full: 'muted',
  deposit: 'accent',
  interim: 'accent',
  balance: 'gold',
  product: 'default',
  breakdown: 'muted',
  attached: 'success',
  missing: 'warning',
  deleted: 'muted',
  upload_error: 'destructive',
}

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  completed: 'Terminé',
  archived: 'Archivé',
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
  rib: 'RIB',
  to_confirm: 'En attente',
  to_negotiate: 'À négocier',
  validated: 'Validé',
  rejected: 'Rejeté',
  unpaid: 'Impayée',
  on_hold: 'En attente',
  paid: 'Payée',
  full: 'Complète',
  deposit: 'Acompte',
  interim: 'Intermédiaire',
  balance: 'Solde',
  product: 'Produit',
  breakdown: 'Détail',
  attached: 'Joint',
  missing: 'Manquant',
  deleted: 'Supprimé',
  upload_error: 'Erreur',
}

export function StatusBadge({ status, disabled = false }: StatusBadgeProps) {
  return (
    <Badge
      variant={statusVariants[status] ?? 'muted'}
      className={disabled ? 'opacity-45 saturate-50' : undefined}
      aria-disabled={disabled || undefined}
    >
      {statusLabels[status] ?? status}
    </Badge>
  )
}
