import type { ProjectFinancialSummaryRead, SupplierLotRead } from '@/api/types'
import { lotSupplierFigures } from '@/lib/supplierStats'

// The supplier form page (/suppliers/new, /suppliers/:id/edit): where it
// returns to, and its « Lots du projet ».

/** The location state a link to the form passes: the page that opened it. */
export type SupplierFormReturnState = { from: string }

/**
 * Where Enregistrer and Annuler go back to: the page that opened the form,
 * or the fallback (the supplier page for an edit, the list for a creation)
 * when the form was opened directly. Only an in-app path is followed.
 */
export function supplierFormReturnPath(
  state: unknown,
  fallback: string,
): string {
  const from =
    typeof state === 'object' && state !== null && 'from' in state
      ? state.from
      : null
  return typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//')
    ? from
    : fallback
}

/** The lots the supplier is assigned to in the project. */
export function assignedLotIds(
  supplierLots: SupplierLotRead[] | undefined,
  supplierId: string | null,
): number[] {
  if (supplierId === null) return []
  return (supplierLots ?? [])
    .filter((row) => String(row.supplier_id) === supplierId)
    .map((row) => row.lot_id)
}

/**
 * The lots where the supplier has active quotes or invoices: they cannot be
 * unticked (the API refuses it too). A new supplier has none.
 */
export function lockedLotIds(
  summary: ProjectFinancialSummaryRead | undefined,
  supplierId: string | null,
): Set<number> {
  if (supplierId === null) return new Set()
  return new Set(
    (summary?.lots ?? [])
      .filter((lot) => {
        const figures = lotSupplierFigures(lot, supplierId)
        return figures.quoteCount + figures.invoiceCount > 0
      })
      .map((lot) => lot.lot_id),
  )
}

/** Whether two lists of lot ids hold the same lots, in any order. */
export function sameLotIds(left: number[], right: number[]): boolean {
  const rightIds = new Set(right)
  return (
    new Set(left).size === rightIds.size &&
    left.every((lotId) => rightIds.has(lotId))
  )
}
