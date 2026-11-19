import type { SupplierDocumentType } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import {
  type ExpirySignal,
  expirySignalLabels,
  supplierDocumentTypeLabels,
} from '@/lib/supplierDocuments'

export function SupplierDocumentTypeBadge({
  type,
}: {
  type: SupplierDocumentType
}) {
  return (
    <Badge variant="gold" tone="soft">
      {supplierDocumentTypeLabels[type]}
    </Badge>
  )
}

export function ExpirySignalBadge({ signal }: { signal: ExpirySignal }) {
  return (
    <Badge
      variant={signal === 'expired' ? 'destructive' : 'warning'}
      tone="soft"
    >
      {expirySignalLabels[signal]}
    </Badge>
  )
}
