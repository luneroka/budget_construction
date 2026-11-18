import { describe, expect, it } from 'vitest'

import type { ProjectTransactionRead } from '@/api/types'
import {
  buildTransactionRow,
  lotLabel,
  transactionDisplayTitle,
} from '@/lib/transactionWorkspace'

function apiTransaction(
  overrides: Partial<ProjectTransactionRead> = {},
): ProjectTransactionRead {
  return {
    id: 7,
    project_id: 1,
    lot_id: 3,
    lot_code: '02',
    lot_designation: 'Gros œuvre / Maçonnerie',
    has_documents: false,
    document_count: 0,
    supplier_id: 4,
    supplier_name: 'Maçon Durand',
    transaction_type: 'quote',
    title: null,
    reference: null,
    amount_ht: '1000.00',
    vat_rate: '20.00',
    amount_vat: '200.00',
    amount_ttc: '1200.00',
    issued_date: '2026-06-01',
    due_date: null,
    payment_date: null,
    description: null,
    quote_status: 'to_confirm',
    invoice_status: null,
    invoice_type: null,
    payment_method: null,
    created_at: '2026-06-01T10:00:00',
    updated_at: '2026-06-01T10:00:00',
    deleted_at: null,
    document_original_filenames: [],
    ...overrides,
  }
}

describe('transactionDisplayTitle', () => {
  it('uses the libellé when there is one', () => {
    expect(
      transactionDisplayTitle({
        title: 'Dalle garage',
        transaction_type: 'quote',
        supplier_name: 'Maçon Durand',
      }),
    ).toBe('Dalle garage')
  })

  it('falls back to the type and the supplier', () => {
    expect(
      transactionDisplayTitle({
        title: '  ',
        transaction_type: 'invoice',
        supplier_name: 'Maçon Durand',
      }),
    ).toBe('Facture · Maçon Durand')
  })

  it('says just the type without a supplier', () => {
    expect(
      transactionDisplayTitle({
        title: null,
        transaction_type: 'quote',
        supplier_name: null,
      }),
    ).toBe('Devis')
  })
})

describe('buildTransactionRow', () => {
  it('finds a transaction by its libellé, its référence and its lot', () => {
    const row = buildTransactionRow(
      apiTransaction({ title: 'Dalle garage', reference: 'DEV-2026-14' }),
    )

    expect(row.searchText).toContain('dalle garage')
    expect(row.searchText).toContain('dev-2026-14')
    expect(row.searchText).toContain('gros œuvre')
    expect(row.transaction.lot_id).toBe(3)
  })
})

describe('lotLabel', () => {
  it('reads code then designation', () => {
    expect(
      lotLabel({ code: '00', designation: 'Préparation de chantier' }),
    ).toBe('00 · Préparation de chantier')
  })
})
