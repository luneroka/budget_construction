import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'

import { supplierTotals } from './supplierStats'

const base: Transaction = {
  id: '1',
  budget_line_id: '3',
  supplier_id: '12',
  supplier_name: 'Menuiserie Dupont',
  transaction_type: 'invoice',
  amount_ht: 1000,
  vat_rate: 20,
  amount_vat: 200,
  amount_ttc: 1200,
  issued_date: '2026-03-01',
  due_date: null,
  payment_date: null,
  created_at: null,
  updated_at: null,
  deleted_at: null,
  description: '',
  quote_status: null,
  invoice_status: 'unpaid',
  invoice_type: 'full',
  payment_method: 'wire',
  select_as_budget: false,
  document_state: 'missing',
  document_count: 0,
}

const quote = (overrides: Partial<Transaction>): Transaction => ({
  ...base,
  transaction_type: 'quote',
  quote_status: 'validated',
  invoice_status: null,
  invoice_type: null,
  ...overrides,
})

const invoice = (overrides: Partial<Transaction>): Transaction => ({
  ...base,
  ...overrides,
})

describe('supplierTotals', () => {
  it('counts only the quotes kept as budget', () => {
    const totals = supplierTotals([
      quote({ id: '1', amount_ttc: 5000, select_as_budget: true }),
      quote({ id: '2', amount_ttc: 4200 }),
    ])

    expect(totals).toMatchObject({ retainedTtc: 5000, quoteCount: 2 })
  })

  it('splits what is invoiced into paid and still to pay', () => {
    const totals = supplierTotals([
      invoice({ id: '3', amount_ttc: 1200, invoice_status: 'paid' }),
      invoice({ id: '4', amount_ttc: 800, invoice_status: 'on_hold' }),
      invoice({ id: '5', amount_ttc: 500 }),
    ])

    expect(totals).toMatchObject({
      invoicedTtc: 2500,
      paidTtc: 1200,
      toPayTtc: 1300,
      invoiceCount: 3,
    })
  })

  it('is all zeros for a supplier without a transaction', () => {
    expect(supplierTotals([])).toEqual({
      retainedTtc: 0,
      invoicedTtc: 0,
      paidTtc: 0,
      toPayTtc: 0,
      quoteCount: 0,
      invoiceCount: 0,
    })
  })
})
