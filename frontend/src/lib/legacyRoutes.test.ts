import { describe, expect, it } from 'vitest'

import {
  quotesAndInvoicesRedirect,
  supplierQuotesAndInvoicesRedirect,
} from './legacyRoutes'

describe('quotesAndInvoicesRedirect', () => {
  it('sends /transactions to /devis-factures', () => {
    expect(quotesAndInvoicesRedirect({ search: '', hash: '' })).toBe(
      '/devis-factures',
    )
  })

  it('keeps the query string and the hash', () => {
    expect(
      quotesAndInvoicesRedirect({
        search: '?quick_view=unpaid_invoices',
        hash: '#top',
      }),
    ).toBe('/devis-factures?quick_view=unpaid_invoices#top')
  })
})

describe('supplierQuotesAndInvoicesRedirect', () => {
  it('sends /suppliers/:id/transactions to /suppliers/:id/devis-factures', () => {
    expect(
      supplierQuotesAndInvoicesRedirect('12', { search: '', hash: '' }),
    ).toBe('/suppliers/12/devis-factures')
  })

  it('keeps the query string and the hash', () => {
    expect(
      supplierQuotesAndInvoicesRedirect('12', {
        search: '?page=2',
        hash: '#x',
      }),
    ).toBe('/suppliers/12/devis-factures?page=2#x')
  })
})
