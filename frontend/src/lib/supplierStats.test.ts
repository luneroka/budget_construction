import { describe, expect, it } from 'vitest'

import type {
  FinancialTotalsRead,
  LotFinancialSummaryRead,
  ProjectFinancialSummaryRead,
} from '@/api/types'

import {
  EMPTY_FIGURES,
  lotSupplierFigures,
  moneyFigures,
  supplierFigures,
} from './supplierStats'

const totals = (
  overrides: Partial<FinancialTotalsRead> = {},
): FinancialTotalsRead => ({
  planned_cost_ttc: '1500.00',
  validated_quote_amount_ttc: '1500.00',
  invoiced_amount_ttc: '650.00',
  paid_invoice_amount_ttc: '600.00',
  unpaid_invoice_amount_ttc: '0.00',
  on_hold_invoice_amount_ttc: '50.00',
  to_pay_amount_ttc: '50.00',
  quote_count: 5,
  validated_quote_count: 2,
  invoice_count: 2,
  ...overrides,
})

const lot = (
  suppliers: LotFinancialSummaryRead['suppliers'],
): LotFinancialSummaryRead => ({
  ...totals(),
  lot_id: 2,
  project_id: null,
  code: '02',
  designation: 'Gros œuvre / Maçonnerie',
  is_global: true,
  suppliers,
})

describe('moneyFigures', () => {
  it('reads the figures the API computed, as they are', () => {
    expect(moneyFigures(totals())).toEqual({
      plannedTtc: 1500,
      validatedQuotesTtc: 1500,
      invoicedTtc: 650,
      paidTtc: 600,
      toPayTtc: 50,
      quoteCount: 5,
      invoiceCount: 2,
    })
  })

  it('is all zeros for a group the API does not list', () => {
    expect(moneyFigures(undefined)).toEqual(EMPTY_FIGURES)
  })
})

describe('supplierFigures', () => {
  const summary = {
    ...totals(),
    suppliers: [
      { ...totals({ planned_cost_ttc: '340.00' }), supplier_id: 7 },
      { ...totals(), supplier_id: 12 },
    ],
  } as ProjectFinancialSummaryRead

  it('picks the supplier by id', () => {
    expect(supplierFigures(summary, '7').plannedTtc).toBe(340)
    expect(supplierFigures(summary, 12).plannedTtc).toBe(1500)
  })

  it('is all zeros for a supplier without a transaction in the project', () => {
    expect(supplierFigures(summary, '99')).toEqual(EMPTY_FIGURES)
    expect(supplierFigures(undefined, '7')).toEqual(EMPTY_FIGURES)
  })
})

describe('lotSupplierFigures', () => {
  const lot02 = lot([
    { ...totals({ planned_cost_ttc: '1000.00' }), supplier_id: 12 },
    { ...totals({ planned_cost_ttc: '150.00' }), supplier_id: null },
  ])

  it('picks the supplier card and the « Sans fournisseur » card', () => {
    expect(lotSupplierFigures(lot02, '12').plannedTtc).toBe(1000)
    expect(lotSupplierFigures(lot02, null).plannedTtc).toBe(150)
  })

  it('is all zeros for an assigned supplier with nothing in the lot', () => {
    expect(lotSupplierFigures(lot02, '7')).toEqual(EMPTY_FIGURES)
  })
})
