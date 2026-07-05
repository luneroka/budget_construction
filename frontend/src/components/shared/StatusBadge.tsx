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
  diy_estimate: 'gold',
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
  completed: 'Termine',
  archived: 'Archive',
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
  to_confirm: 'A confirmer',
  to_negotiate: 'A negocier',
  validated: 'Valide',
  unpaid: 'Impayee',
  on_hold: 'En attente',
  paid: 'Payee',
  full: 'Complete',
  deposit: 'Acompte',
  interim: 'Intermediaire',
  balance: 'Solde',
  product: 'Produit',
  breakdown: 'Detail',
  attached: 'Joint',
  missing: 'Manquant',
  deleted: 'Supprime',
  upload_error: 'Erreur',
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge variant={statusVariants[status] ?? 'muted'}>
      {statusLabels[status] ?? status}
    </Badge>
  )
}
