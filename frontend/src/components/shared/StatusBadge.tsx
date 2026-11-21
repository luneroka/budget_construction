import { Badge, type BadgeVariant } from '@/components/ui/badge'

type StatusBadgeProps = {
  status: string
  disabled?: boolean
  /**
   * Drop the status colour and render grey, for rows that are present but not
   * carrying weight — a rejected quote, say. Unlike
   * `disabled` this is purely visual: the badge still states a real status, so
   * it must not be announced as disabled.
   */
  dimmed?: boolean
}

const statusVariants: Record<string, BadgeVariant> = {
  draft: 'muted',
  active: 'accent',
  completed: 'success',
  archived: 'muted',
  quote: 'accent',
  invoice: 'default',
  rib: 'gold',
  to_confirm: 'warning',
  to_negotiate: 'warning',
  validated: 'success',
  rejected: 'secondary',
  unpaid: 'warning',
  on_hold: 'warning',
  paid: 'success',
  full: 'muted',
  deposit: 'accent',
  interim: 'accent',
  balance: 'gold',
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
  attached: 'Joint',
  missing: 'Manquant',
  deleted: 'Supprimé',
  upload_error: 'Erreur',
}

export function StatusBadge({
  status,
  disabled = false,
  dimmed = false,
}: StatusBadgeProps) {
  return (
    <Badge
      variant={dimmed ? 'muted' : (statusVariants[status] ?? 'muted')}
      tone="soft"
      className={disabled ? 'opacity-45 saturate-50' : undefined}
      aria-disabled={disabled || undefined}
    >
      {statusLabels[status] ?? status}
    </Badge>
  )
}
