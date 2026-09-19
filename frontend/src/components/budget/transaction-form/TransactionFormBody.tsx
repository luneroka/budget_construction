import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select } from '@/components/ui/select'
import type {
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  QuoteStatus,
  Supplier,
  TransactionType,
} from '@/types'

import { SupplierSelectField } from './SupplierSelectField'
import {
  DetailsDisclosure,
  Field,
  FieldGroup,
  TtcAmountField,
} from './TransactionFormFields'
import {
  type AmountFields,
  invoiceStatusLabels,
  invoiceTypeLabels,
  issuedDateLabels,
  paymentMethodLabels,
  quoteStatusLabels,
} from './transactionForm'

export type TransactionBodyForm = AmountFields & {
  supplier_id: string
  issued_date: string
  due_date: string
  payment_date: string
  description: string
  quote_status: QuoteStatus
  invoice_status: InvoiceStatus
  invoice_type: InvoiceType
  payment_method: PaymentMethod
}

export type TransactionTextField =
  | 'supplier_id'
  | 'amount_ht'
  | 'vat_rate'
  | 'amount_ttc'
  | 'issued_date'
  | 'due_date'
  | 'payment_date'
  | 'description'

function optionsOf<T extends string>(labels: Record<T, string>) {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({
    value,
    label,
  }))
}

// The fields of a quote, estimate or invoice, in the order they matter: the
// amount, who and when, the status, then everything else behind "Plus de
// détails". Shared by the create and edit modals so both read the same.
export function TransactionFormBody({
  idPrefix,
  transactionType,
  form,
  suppliers,
  disabled,
  autoFocusAmount,
  detailsOpenByDefault,
  budgetSelection,
  documents,
  footnote,
  onFieldChange,
  onQuoteStatusChange,
  onInvoiceStatusChange,
  onInvoiceTypeChange,
  onPaymentMethodChange,
}: {
  idPrefix: string
  transactionType: TransactionType
  form: TransactionBodyForm
  suppliers: Supplier[]
  disabled?: boolean
  /** Puts the cursor in the amount, for a transaction being created. */
  autoFocusAmount?: boolean
  detailsOpenByDefault?: boolean
  /** The "sélectionner pour le calcul du budget" row, for quotes and estimates. */
  budgetSelection?: ReactNode
  documents: ReactNode
  footnote?: ReactNode
  onFieldChange: (key: TransactionTextField, value: string) => void
  onQuoteStatusChange: (status: QuoteStatus) => void
  onInvoiceStatusChange: (status: InvoiceStatus) => void
  onInvoiceTypeChange: (invoiceType: InvoiceType) => void
  onPaymentMethodChange: (method: PaymentMethod) => void
}) {
  const isQuote = transactionType === 'quote'
  const isInvoice = transactionType === 'invoice'
  // A self-built estimate has no supplier to name.
  const hasSupplier = transactionType !== 'diy_estimate'

  return (
    <div className="space-y-5">
      <TtcAmountField
        idPrefix={idPrefix}
        form={form}
        disabled={disabled}
        autoFocus={autoFocusAmount}
        onChange={onFieldChange}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {hasSupplier ? (
          <Field label="Fournisseur" htmlFor={`${idPrefix}-supplier`}>
            <SupplierSelectField
              id={`${idPrefix}-supplier`}
              value={form.supplier_id}
              suppliers={suppliers}
              disabled={disabled}
              onChange={(supplierId) =>
                onFieldChange('supplier_id', supplierId)
              }
            />
          </Field>
        ) : null}
        <Field
          label={issuedDateLabels[transactionType]}
          htmlFor={`${idPrefix}-issued-date`}
        >
          <Input
            id={`${idPrefix}-issued-date`}
            type="date"
            required
            disabled={disabled}
            value={form.issued_date}
            onChange={(event) =>
              onFieldChange('issued_date', event.target.value)
            }
          />
        </Field>
      </div>

      {isQuote ? (
        <FieldGroup label="Statut">
          {(labelId) => (
            <SegmentedControl
              aria-labelledby={labelId}
              value={form.quote_status}
              disabled={disabled}
              options={optionsOf(quoteStatusLabels)}
              onChange={onQuoteStatusChange}
            />
          )}
        </FieldGroup>
      ) : null}

      {isInvoice ? (
        <FieldGroup label="Statut">
          {(labelId) => (
            <SegmentedControl
              aria-labelledby={labelId}
              value={form.invoice_status}
              disabled={disabled}
              options={optionsOf(invoiceStatusLabels)}
              onChange={onInvoiceStatusChange}
            />
          )}
        </FieldGroup>
      ) : null}

      {isInvoice && form.invoice_status === 'paid' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payée le" htmlFor={`${idPrefix}-payment-date`}>
            <Input
              id={`${idPrefix}-payment-date`}
              type="date"
              required
              disabled={disabled}
              value={form.payment_date}
              onChange={(event) =>
                onFieldChange('payment_date', event.target.value)
              }
            />
          </Field>
          <Field
            label="Moyen de paiement"
            htmlFor={`${idPrefix}-payment-method`}
          >
            <Select
              id={`${idPrefix}-payment-method`}
              disabled={disabled}
              value={form.payment_method}
              onChange={(event) =>
                onPaymentMethodChange(event.target.value as PaymentMethod)
              }
            >
              {optionsOf(paymentMethodLabels).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      {isInvoice ? null : budgetSelection}

      <DetailsDisclosure
        label="Plus de détails"
        defaultOpen={detailsOpenByDefault}
      >
        {isQuote || isInvoice ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Échéance" htmlFor={`${idPrefix}-due-date`}>
              <Input
                id={`${idPrefix}-due-date`}
                type="date"
                disabled={disabled}
                value={form.due_date}
                onChange={(event) =>
                  onFieldChange('due_date', event.target.value)
                }
              />
            </Field>
            {isInvoice ? (
              <Field
                label="Type de facture"
                htmlFor={`${idPrefix}-invoice-type`}
              >
                <Select
                  id={`${idPrefix}-invoice-type`}
                  disabled={disabled}
                  value={form.invoice_type}
                  onChange={(event) =>
                    onInvoiceTypeChange(event.target.value as InvoiceType)
                  }
                >
                  {optionsOf(invoiceTypeLabels).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        ) : null}
        <Field label="Description" htmlFor={`${idPrefix}-description`}>
          <Input
            id={`${idPrefix}-description`}
            disabled={disabled}
            value={form.description}
            onChange={(event) =>
              onFieldChange('description', event.target.value)
            }
          />
        </Field>
        {documents}
        {footnote}
      </DetailsDisclosure>
    </div>
  )
}
