import { describe, expect, it } from 'vitest'

import type { ProjectLotRead } from '@/api/types'
import type { Transaction } from '@/types'
import {
  NO_SUPPLIER_LABEL,
  findVisibleLot,
  groupLotTransactionsBySupplier,
  lotsBySupplier,
  visibleLots,
} from '@/lib/lots'

function lot(
  id: number,
  overrides: Partial<ProjectLotRead> = {},
): ProjectLotRead {
  return {
    id,
    project_id: null,
    code: String(id).padStart(2, '0'),
    designation: `Lot ${id}`,
    is_global: true,
    is_hidden: false,
    active_transaction_count: 0,
    ...overrides,
  }
}

function transaction(
  id: number,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: String(id),
    project_id: '1',
    lot_id: 2,
    lot_code: '02',
    lot_designation: 'Gros œuvre / Maçonnerie',
    supplier_id: null,
    supplier_name: null,
    transaction_type: 'quote',
    title: null,
    reference: null,
    amount_ht: 100,
    vat_rate: 20,
    amount_vat: 20,
    amount_ttc: 120,
    issued_date: '2026-06-01',
    due_date: null,
    payment_date: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    description: '',
    quote_status: 'to_confirm',
    invoice_status: null,
    invoice_type: null,
    payment_method: null,
    document_state: 'missing',
    document_count: 0,
    ...overrides,
  }
}

const supplierNames = new Map([
  ['4', 'Maçon Durand'],
  ['5', 'Béton Express'],
  ['6', 'Électricien Petit'],
])

describe('groupLotTransactionsBySupplier', () => {
  it('makes one card per supplier, by name, then « Sans fournisseur »', () => {
    const cards = groupLotTransactionsBySupplier({
      lotId: 2,
      transactions: [
        transaction(1, { supplier_id: '4', supplier_name: 'Maçon Durand' }),
        transaction(2),
        transaction(3, {
          supplier_id: '5',
          supplier_name: 'Béton Express',
          transaction_type: 'invoice',
        }),
        // Another lot's transaction stays out.
        transaction(4, { lot_id: 3, supplier_id: '6' }),
      ],
      assignments: [
        { project_id: 1, supplier_id: 4, lot_id: 2 },
        { project_id: 1, supplier_id: 5, lot_id: 2 },
      ],
      supplierNames,
    })

    expect(cards.map((card) => card.supplierName)).toEqual([
      'Béton Express',
      'Maçon Durand',
      NO_SUPPLIER_LABEL,
    ])
    expect(cards[2].supplierId).toBeNull()
    expect(cards[2].transactions.map((row) => row.id)).toEqual(['2'])
  })

  it('shows an assigned supplier without transactions, and no « Sans fournisseur » card when every transaction has one', () => {
    const cards = groupLotTransactionsBySupplier({
      lotId: 2,
      transactions: [],
      assignments: [{ project_id: 1, supplier_id: 6, lot_id: 2 }],
      supplierNames,
    })

    expect(cards).toEqual([
      { supplierId: '6', supplierName: 'Électricien Petit', transactions: [] },
    ])
  })

  it('is empty for an empty lot', () => {
    expect(
      groupLotTransactionsBySupplier({
        lotId: 9,
        transactions: [transaction(1)],
        assignments: [],
        supplierNames,
      }),
    ).toEqual([])
  })
})

describe('findVisibleLot', () => {
  const lots = [lot(1), lot(2, { is_hidden: true })]

  it('finds a visible lot by its route id', () => {
    expect(findVisibleLot(lots, '1')?.id).toBe(1)
  })

  it('is null for a hidden, unknown or malformed lot (not found)', () => {
    expect(findVisibleLot(lots, '2')).toBeNull()
    expect(findVisibleLot(lots, '99')).toBeNull()
    expect(findVisibleLot(lots, 'abc')).toBeNull()
  })

  it('leaves hidden lots out of the lot list', () => {
    expect(visibleLots(lots).map((row) => row.id)).toEqual([1])
  })
})

describe('lotsBySupplier', () => {
  it('lists each supplier’s visible lots in the project’s lot order', () => {
    const lots = [lot(1), lot(2), lot(3, { is_hidden: true })]
    const map = lotsBySupplier(
      [
        { project_id: 1, supplier_id: 4, lot_id: 2 },
        { project_id: 1, supplier_id: 4, lot_id: 1 },
        { project_id: 1, supplier_id: 4, lot_id: 3 },
        { project_id: 1, supplier_id: 5, lot_id: 2 },
      ],
      lots,
    )

    expect(map.get('4')?.map((row) => row.id)).toEqual([1, 2])
    expect(map.get('5')?.map((row) => row.id)).toEqual([2])
    expect(map.get('6')).toBeUndefined()
  })
})
