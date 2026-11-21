import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'

import {
  type TransactionFormState,
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
  return { ...createInitialFormState({ lotId: '3' }), ...overrides }
}

const transaction: Transaction = {
  id: '7',
  project_id: '1',
  lot_id: 3,
  lot_code: '02',
  lot_designation: 'Gros œuvre / Maçonnerie',
  supplier_id: '12',
  supplier_name: 'Maçonnerie Dupont',
  transaction_type: 'invoice',
  title: 'Dalle garage',
  reference: 'FA-12',
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

  it('starts in the lot it was opened from', () => {
    expect(createInitialFormState({ lotId: '7' })).toMatchObject({
      lot_id: '7',
      title: '',
      reference: '',
    })
  })

  it('derives VAT and TTC from a prefilled HT', () => {
    expect(
      createInitialFormState({
        transactionType: 'invoice',
        prefill: { amount_ht: '100.00', vat_rate: '20' },
      }),
    ).toMatchObject({ amount_vat: '20.00', amount_ttc: '120.00' })
  })
})

describe('normalizeForType', () => {
  it('clears the quote status when switching to an invoice', () => {
    const invoice = normalizeForType(
      quoteForm({ quote_status: 'validated' }),
      'invoice',
    )

    expect(invoice.transaction_type).toBe('invoice')
    expect(invoice.quote_status).toBe('to_confirm')
  })

  it('clears the payment date when switching to a quote', () => {
    const quote = normalizeForType(
      {
        ...quoteForm(),
        transaction_type: 'invoice',
        payment_date: '2026-04-02',
      },
      'quote',
    )

    expect(quote.payment_date).toBe('')
  })
})

describe('buildTransactionCreate', () => {
  it('sends the lot, the libellé and the référence', () => {
    const payload = buildTransactionCreate({
      form: quoteForm({
        amount_ht: '100',
        quote_status: 'rejected',
        title: 'Dalle garage',
        reference: 'DEV-14',
      }),
    })

    expect(payload.lot_id).toBe(3)
    expect(payload.title).toBe('Dalle garage')
    expect(payload.reference).toBe('DEV-14')
    expect(payload.quote_status).toBe('rejected')
    expect(payload).not.toHaveProperty('invoice_status')
    expect(payload).not.toHaveProperty('select_as_budget')
  })

  it('sends empty strings as null', () => {
    const payload = buildTransactionCreate({
      form: quoteForm({
        amount_ht: '100',
        supplier_id: '',
        description: '  ',
        title: ' ',
        reference: '',
      }),
    })

    expect(payload.supplier_id).toBeNull()
    expect(payload.title).toBeNull()
    expect(payload.reference).toBeNull()
    expect(payload.description).toBeNull()
    expect(payload.due_date).toBeNull()
  })

  it('refuses a form without a lot', () => {
    expect(() =>
      buildTransactionCreate({ form: quoteForm({ lot_id: '' }) }),
    ).toThrow('Lot invalide')
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

  it('copies the lot, supplier, libellé, VAT rate and amount HT', () => {
    expect(invoicePrefillFromQuote(quote)).toEqual({
      lot_id: '3',
      supplier_id: '12',
      title: 'Dalle garage',
      vat_rate: '10',
      amount_ht: '1000.00',
    })
  })

  it('opens an ordinary invoice form, every field editable', () => {
    const form = createInitialFormState({
      transactionType: 'invoice',
      lotId: '3',
      prefill: invoicePrefillFromQuote({
        ...quote,
        supplier_id: null,
        title: null,
      }),
    })

    expect(form).toMatchObject({
      transaction_type: 'invoice',
      lot_id: '3',
      supplier_id: '',
      title: '',
      amount_ht: '1000.00',
      amount_ttc: '1100.00',
    })
    const payload = buildTransactionCreate({ form })
    expect(payload.transaction_type).toBe('invoice')
    expect(Object.keys(payload).some((key) => key.includes('quote_id'))).toBe(
      false,
    )
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
    expect(paid.lot_id).toBe(3)
    expect(paid.title).toBe('Dalle garage')
    expect(paid.reference).toBe('FA-12')
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
