import { Badge, type BadgeVariant } from '@/components/ui/badge'

type StatusBadgeProps = {
  status: string
}

const statusVariants: Record<string, BadgeVariant> = {
  draft: 'muted',
  active: 'accent',
  completed: 'success',
  archived: 'muted',
  quote: 'accent',
  diy_estimate: 'accent',
  invoice: 'default',
  to_confirm: 'warning',
  to_negotiate: 'warning',
  validated: 'success',
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
  to_confirm: 'À confirmer',
  to_negotiate: 'À négocier',
  validated: 'Validé',
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

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status] ?? 'muted'}>
      {statusLabels[status] ?? status}
    </Badge>
  )
}
