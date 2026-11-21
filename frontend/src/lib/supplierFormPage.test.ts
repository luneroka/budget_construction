import { describe, expect, it } from 'vitest'

import type {
  FinancialTotalsRead,
  LotFinancialSummaryRead,
  ProjectFinancialSummaryRead,
} from '@/api/types'

import {
  assignedLotIds,
  lockedLotIds,
  sameLotIds,
  supplierFormReturnPath,
} from './supplierFormPage'

const totals = (
  overrides: Partial<FinancialTotalsRead> = {},
): FinancialTotalsRead => ({
  planned_cost_ttc: '0.00',
  validated_quote_amount_ttc: '0.00',
  invoiced_amount_ttc: '0.00',
  paid_invoice_amount_ttc: '0.00',
  unpaid_invoice_amount_ttc: '0.00',
  on_hold_invoice_amount_ttc: '0.00',
  to_pay_amount_ttc: '0.00',
  quote_count: 0,
  validated_quote_count: 0,
  invoice_count: 0,
  ...overrides,
})

const lot = (
  lotId: number,
  suppliers: LotFinancialSummaryRead['suppliers'],
): LotFinancialSummaryRead => ({
  ...totals(),
  lot_id: lotId,
  project_id: null,
  code: String(lotId).padStart(2, '0'),
  designation: `Lot ${lotId}`,
  is_global: true,
  suppliers,
})

describe('supplierFormReturnPath', () => {
  it('goes back to the page that opened the form', () => {
    expect(
      supplierFormReturnPath({ from: '/suppliers?q=ma' }, '/suppliers'),
    ).toBe('/suppliers?q=ma')
    expect(
      supplierFormReturnPath(
        { from: '/suppliers/7/documents' },
        '/suppliers/7',
      ),
    ).toBe('/suppliers/7/documents')
  })

  it('falls back when the form was opened directly', () => {
    expect(supplierFormReturnPath(null, '/suppliers/7')).toBe('/suppliers/7')
    expect(supplierFormReturnPath(undefined, '/suppliers')).toBe('/suppliers')
    expect(supplierFormReturnPath({}, '/suppliers')).toBe('/suppliers')
  })

  it('never follows a path out of the app', () => {
    expect(
      supplierFormReturnPath({ from: 'https://example.com' }, '/suppliers'),
    ).toBe('/suppliers')
    expect(
      supplierFormReturnPath({ from: '//example.com' }, '/suppliers'),
    ).toBe('/suppliers')
    expect(supplierFormReturnPath({ from: 12 }, '/suppliers')).toBe(
      '/suppliers',
    )
  })
})

describe('assignedLotIds', () => {
  const rows = [
    { project_id: 1, supplier_id: 7, lot_id: 2 },
    { project_id: 1, supplier_id: 8, lot_id: 3 },
    { project_id: 1, supplier_id: 7, lot_id: 6 },
  ]

  it('lists the supplier’s lots in the project', () => {
    expect(assignedLotIds(rows, '7')).toEqual([2, 6])
  })

  it('is empty for a new supplier', () => {
    expect(assignedLotIds(rows, null)).toEqual([])
    expect(assignedLotIds(undefined, '7')).toEqual([])
  })
})

describe('lockedLotIds', () => {
  const summary = {
    ...totals(),
    lots: [
      lot(2, [{ ...totals({ quote_count: 1 }), supplier_id: 7 }]),
      lot(3, [{ ...totals({ invoice_count: 2 }), supplier_id: 7 }]),
      lot(6, [{ ...totals({ quote_count: 1 }), supplier_id: 8 }]),
      lot(10, []),
    ],
  } as unknown as ProjectFinancialSummaryRead

  it('locks the lots where the supplier has quotes or invoices', () => {
    expect([...lockedLotIds(summary, '7')].sort()).toEqual([2, 3])
  })

  it('locks nothing for a new supplier', () => {
    expect(lockedLotIds(summary, null).size).toBe(0)
    expect(lockedLotIds(undefined, '7').size).toBe(0)
  })
})

describe('sameLotIds', () => {
  it('ignores the order', () => {
    expect(sameLotIds([2, 6], [6, 2])).toBe(true)
  })

  it('tells an added or removed lot', () => {
    expect(sameLotIds([2, 6], [2])).toBe(false)
    expect(sameLotIds([2], [2, 6])).toBe(false)
    expect(sameLotIds([2, 6], [2, 10])).toBe(false)
  })
})
