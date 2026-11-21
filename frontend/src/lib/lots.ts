import type { ProjectLotRead, SupplierLotRead } from '@/api/types'
import type { Transaction } from '@/types'

export const NO_SUPPLIER_LABEL = 'Sans fournisseur'

export function visibleLots(lots: ProjectLotRead[] | undefined) {
  return (lots ?? []).filter((lot) => !lot.is_hidden)
}

export function hiddenLots(lots: ProjectLotRead[] | undefined) {
  return (lots ?? []).filter((lot) => lot.is_hidden)
}

export type SupplierLotGroup = {
  /** null: the « Sans fournisseur » card. */
  supplierId: string | null
  supplierName: string
  transactions: Transaction[]
}

// The cards of one lot: every supplier assigned to it (with or without a
// transaction), then « Sans fournisseur » when transactions have no
// supplier. Suppliers by name; transactions most recent first.
export function groupLotTransactionsBySupplier({
  lotId,
  transactions,
  assignments,
  supplierNames,
}: {
  lotId: number
  transactions: Transaction[]
  assignments: SupplierLotRead[]
  supplierNames: Map<string, string>
}): SupplierLotGroup[] {
  const groups = new Map<string, SupplierLotGroup>()
  const withoutSupplier: Transaction[] = []

  for (const assignment of assignments) {
    if (assignment.lot_id !== lotId) continue
    const supplierId = String(assignment.supplier_id)
    const name = supplierNames.get(supplierId)
    if (name === undefined) continue
    groups.set(supplierId, { supplierId, supplierName: name, transactions: [] })
  }

  const lotTransactions = transactions
    .filter((transaction) => transaction.lot_id === lotId)
    .sort((left, right) =>
      left.issued_date === right.issued_date
        ? Number(right.id) - Number(left.id)
        : right.issued_date.localeCompare(left.issued_date),
    )

  for (const transaction of lotTransactions) {
    if (transaction.supplier_id === null) {
      withoutSupplier.push(transaction)
      continue
    }
    const group = groups.get(transaction.supplier_id) ?? {
      supplierId: transaction.supplier_id,
      supplierName:
        supplierNames.get(transaction.supplier_id) ??
        transaction.supplier_name ??
        NO_SUPPLIER_LABEL,
      transactions: [],
    }
    group.transactions.push(transaction)
    groups.set(transaction.supplier_id, group)
  }

  const cards = [...groups.values()].sort((left, right) =>
    left.supplierName.localeCompare(right.supplierName, 'fr'),
  )
  if (withoutSupplier.length > 0) {
    cards.push({
      supplierId: null,
      supplierName: NO_SUPPLIER_LABEL,
      transactions: withoutSupplier,
    })
  }
  return cards
}

// The lot page of a lot, or null when the project does not show it (hidden,
// another project's, unknown): the page then answers not found.
export function findVisibleLot(
  lots: ProjectLotRead[] | undefined,
  lotId: string | undefined,
) {
  const id = Number(lotId)
  if (!Number.isInteger(id)) return null
  return visibleLots(lots).find((lot) => lot.id === id) ?? null
}

// The Fournisseurs page's « Lots » column: each supplier's visible lots in
// the project, in the project's lot order.
export function lotsBySupplier(
  assignments: SupplierLotRead[] | undefined,
  lots: ProjectLotRead[] | undefined,
): Map<string, ProjectLotRead[]> {
  const visible = visibleLots(lots)
  const order = new Map(visible.map((lot, index) => [lot.id, index]))
  const result = new Map<string, ProjectLotRead[]>()

  for (const assignment of assignments ?? []) {
    const position = order.get(assignment.lot_id)
    if (position === undefined) continue
    const supplierId = String(assignment.supplier_id)
    const supplierLots = result.get(supplierId) ?? []
    supplierLots.push(visible[position])
    result.set(supplierId, supplierLots)
  }
  for (const supplierLots of result.values()) {
    supplierLots.sort(
      (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
    )
  }
  return result
}
