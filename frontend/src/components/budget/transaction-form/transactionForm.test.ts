import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'

import {
  type TransactionFormState,
  buildProductTransactionCreate,
  buildTransactionCreate,
  buildTransactionUpdate,
  createInitialFormState,
  createInitialUpdateFormState,
  defaultPaymentDate,
  invoicePrefillFromQuote,
  isSameFormState,
  normalizeForType,
  recalculateAmounts,
  todayAsInputValue,
} from './transactionForm'

const amounts = {
  amount_ht: '',
  vat_rate: '20',
  amount_vat: '',
  amount_ttc: '',
}

function quoteForm(
  overrides: Partial<TransactionFormState> = {},
): TransactionFormState {
  return { ...createInitialFormState(), ...overrides }
}

const transaction: Transaction = {
  id: '7',
  budget_line_id: '3',
  supplier_id: '12',
  supplier_name: 'Maçonnerie Dupont',
  transaction_type: 'invoice',
  amount_ht: 100,
  vat_rate: 20,
  amount_vat: 20,
  amount_ttc: 120,
  issued_date: '2026-03-01',
  due_date: '2026-03-31',
  payment_date: null,
  created_at: null,
  updated_at: null,
  deleted_at: null,
  description: 'Dalle',
  quote_status: null,
  invoice_status: 'unpaid',
  invoice_type: 'deposit',
  payment_method: 'wire',
  select_as_budget: false,
  document_state: 'missing',
  document_count: 0,
}

describe('recalculateAmounts', () => {
  it('derives VAT and TTC from HT', () => {
    expect(recalculateAmounts({ ...amounts, amount_ht: '100' }, 'ht')).toEqual({
      ...amounts,
      amount_ht: '100',
      amount_vat: '20.00',
      amount_ttc: '120.00',
    })
  })

  it('derives HT and VAT from TTC', () => {
    expect(
      recalculateAmounts({ ...amounts, amount_ttc: '120' }, 'ttc'),
    ).toEqual({
      ...amounts,
      amount_ht: '100.00',
      amount_vat: '20.00',
      amount_ttc: '120',
    })
  })

  it('rounds to cents', () => {
    expect(
      recalculateAmounts({ ...amounts, amount_ht: '33.33' }, 'ht'),
    ).toEqual({
      ...amounts,
      amount_ht: '33.33',
      amount_vat: '6.67',
      amount_ttc: '40.00',
    })
  })

  it('treats an empty source amount as zero', () => {
    expect(recalculateAmounts({ ...amounts, amount_ht: '' }, 'ht')).toEqual({
      ...amounts,
      amount_vat: '0.00',
      amount_ttc: '0.00',
    })
    expect(recalculateAmounts({ ...amounts, amount_ttc: '' }, 'ttc')).toEqual({
      ...amounts,
      amount_ht: '0.00',
      amount_vat: '0.00',
    })
  })

  it('keeps the entered amounts when the VAT rate is not usable', () => {
    expect(
      recalculateAmounts(
        { amount_ht: '100', vat_rate: 'abc', amount_vat: '9', amount_ttc: '5' },
        'ht',
      ),
    ).toEqual({
      amount_ht: '100',
      vat_rate: 'abc',
      amount_vat: '',
      amount_ttc: '5',
    })
  })
})

describe('createInitialFormState', () => {
  it('starts from the type of the button that opened it', () => {
    expect(
      createInitialFormState({ transactionType: 'invoice' }),
    ).toMatchObject({ transaction_type: 'invoice', invoice_status: 'unpaid' })
  })

  it('retains a quote as budget when asked, never an invoice', () => {
    expect(
      createInitialFormState({ transactionType: 'quote', selectAsBudget: true })
        .select_as_budget,
    ).toBe(true)
    expect(
      createInitialFormState({
        transactionType: 'invoice',
        selectAsBudget: true,
      }).select_as_budget,
    ).toBe(false)
  })

  it('derives HT and VAT from a prefilled TTC', () => {
    expect(
      createInitialFormState({
        transactionType: 'invoice',
        prefill: { amount_ttc: '120.00', vat_rate: '20' },
      }),
    ).toMatchObject({ amount_ht: '100.00', amount_vat: '20.00' })
  })
})

describe('normalizeForType', () => {
  it('drops budget selection when switching to an invoice', () => {
    const invoice = normalizeForType(
      quoteForm({ select_as_budget: true }),
      'invoice',
    )

    expect(invoice.transaction_type).toBe('invoice')
    expect(invoice.select_as_budget).toBe(false)
  })

  it('clears the dates an estimate cannot carry', () => {
    const form = quoteForm({
      due_date: '2026-04-01',
      payment_date: '2026-04-02',
    })

    const estimate = normalizeForType(form, 'diy_estimate')

    expect(estimate.due_date).toBe('')
    expect(estimate.payment_date).toBe('')
  })
})

describe('buildTransactionCreate', () => {
  it('never selects a rejected quote as budget', () => {
    const payload = buildTransactionCreate({
      form: quoteForm({
        amount_ht: '100',
        quote_status: 'rejected',
        select_as_budget: true,
      }),
    })

    expect(payload.select_as_budget).toBe(false)
    expect(payload.quote_status).toBe('rejected')
    expect(payload).not.toHaveProperty('invoice_status')
  })

  it('sends empty strings as null', () => {
    const payload = buildTransactionCreate({
      form: quoteForm({ amount_ht: '100', supplier_id: '', description: '  ' }),
    })

    expect(payload.supplier_id).toBeNull()
    expect(payload.description).toBeNull()
    expect(payload.due_date).toBeNull()
  })

  it('opens the whole product for a first quote, nothing for an invoice', () => {
    const quote = buildProductTransactionCreate(quoteForm({ amount_ht: '100' }))
    const invoice = buildProductTransactionCreate(
      normalizeForType(quoteForm({ amount_ht: '100' }), 'invoice'),
    )

    expect(quote.budget_concern).toBe('entire_product')
    expect(quote).not.toHaveProperty('budget_line_name')
    expect(invoice).not.toHaveProperty('budget_concern')
  })

  it('never sends a supplier for a self-built estimate', () => {
    const payload = buildTransactionCreate({
      form: normalizeForType(
        quoteForm({ amount_ht: '100', supplier_id: '12' }),
        'diy_estimate',
      ),
    })

    expect(payload.supplier_id).toBeNull()
  })

  it('only sends the payment date for a paid invoice', () => {
    const invoice = normalizeForType(
      quoteForm({ amount_ht: '100', payment_date: '2026-04-10' }),
      'invoice',
    )

    expect(buildTransactionCreate({ form: invoice }).payment_date).toBeNull()
    expect(
      buildTransactionCreate({
        form: { ...invoice, invoice_status: 'paid' },
      }).payment_date,
    ).toBe('2026-04-10')
  })
})

describe('invoicePrefillFromQuote', () => {
  const quote: Transaction = {
    ...transaction,
    id: '8',
    transaction_type: 'quote',
    quote_status: 'validated',
    invoice_status: null,
    invoice_type: null,
    payment_method: null,
    amount_ht: 1000,
    vat_rate: 10,
    amount_vat: 100,
    amount_ttc: 1100,
    description: 'Menuiseries',
  }

  it('starts a first invoice from the whole quote', () => {
    expect(invoicePrefillFromQuote(quote, [quote])).toEqual({
      supplier_id: '12',
      vat_rate: '10',
      description: 'Menuiseries',
      amount_ttc: '1100.00',
      invoice_type: 'full',
    })
  })

  it('suggests the balance left after the supplier’s invoices', () => {
    const deposit = { ...transaction, amount_ttc: 330 }
    const otherSupplier = { ...transaction, supplier_id: '99', amount_ttc: 500 }

    expect(
      invoicePrefillFromQuote(quote, [quote, deposit, otherSupplier]),
    ).toMatchObject({ amount_ttc: '770.00', invoice_type: 'balance' })
  })

  it('leaves the amount empty once the quote is fully invoiced', () => {
    const full = { ...transaction, amount_ttc: 1100 }

    expect(invoicePrefillFromQuote(quote, [quote, full]).amount_ttc).toBe('')
  })
})

describe('defaultPaymentDate', () => {
  it('is today, never before the invoice date', () => {
    expect(defaultPaymentDate('2000-01-01')).toBe(todayAsInputValue())
    expect(defaultPaymentDate('2999-12-31')).toBe('2999-12-31')
  })
})

describe('buildTransactionUpdate', () => {
  it('only sends the payment date for a paid invoice', () => {
    const form = createInitialUpdateFormState(transaction)

    const unpaid = buildTransactionUpdate(transaction, {
      ...form,
      payment_date: '2026-04-10',
    })
    const paid = buildTransactionUpdate(transaction, {
      ...form,
      invoice_status: 'paid',
      payment_date: '2026-04-10',
    })

    expect(unpaid.payment_date).toBeNull()
    expect(paid.payment_date).toBe('2026-04-10')
    expect(paid.invoice_type).toBe('deposit')
    expect(paid).not.toHaveProperty('quote_status')
  })

  it('keeps quote fields for a quote and nothing invoice-specific', () => {
    const quote: Transaction = {
      ...transaction,
      transaction_type: 'quote',
      quote_status: 'to_confirm',
      invoice_status: null,
      invoice_type: null,
    }
    const form = createInitialUpdateFormState(quote)

    const payload = buildTransactionUpdate(quote, form)

    expect(payload.quote_status).toBe('to_confirm')
    expect(payload.due_date).toBe('2026-03-31')
    expect(payload).not.toHaveProperty('invoice_status')
    expect(payload).not.toHaveProperty('payment_date')
  })
})

describe('isSameFormState', () => {
  it('sees a form as unchanged until one field differs', () => {
    const form = quoteForm()

    expect(isSameFormState(form, { ...form })).toBe(true)
    expect(isSameFormState(form, { ...form, amount_ttc: '120' })).toBe(false)
  })
})
