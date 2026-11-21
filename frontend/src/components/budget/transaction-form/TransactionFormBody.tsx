import type { ReactNode } from 'react'

import type { ProjectLotRead } from '@/api/types'
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
import { lotLabel } from '@/lib/transactionWorkspace'

import {
  type AmountFields,
  REFERENCE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  invoiceStatusLabels,
  invoiceTypeLabels,
  issuedDateLabels,
  paymentMethodLabels,
  quoteStatusLabels,
} from './transactionForm'

export type TransactionBodyForm = AmountFields & {
  lot_id: string
  supplier_id: string
  title: string
  reference: string
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
  | 'lot_id'
  | 'supplier_id'
  | 'title'
  | 'reference'
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

// The fields of a quote or an invoice, in the order they matter: its lot and
// libellé, the amount, who and when, the status, then everything else behind
// "Plus de détails". Shared by the create and edit modals so both read the
// same.
export function TransactionFormBody({
  idPrefix,
  transactionType,
  form,
  lots,
  suppliers,
  disabled,
  detailsOpenByDefault,
  documents,
  documentsFirst,
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
  /** The lots the transaction can sit in: the project's visible lots. */
  lots: ProjectLotRead[]
  suppliers: Supplier[]
  disabled?: boolean
  detailsOpenByDefault?: boolean
  documents: ReactNode
  /** Puts the document first instead of under "Plus de détails". */
  documentsFirst?: boolean
  footnote?: ReactNode
  onFieldChange: (key: TransactionTextField, value: string) => void
  onQuoteStatusChange: (status: QuoteStatus) => void
  onInvoiceStatusChange: (status: InvoiceStatus) => void
  onInvoiceTypeChange: (invoiceType: InvoiceType) => void
  onPaymentMethodChange: (method: PaymentMethod) => void
}) {
  const isQuote = transactionType === 'quote'
  const isInvoice = transactionType === 'invoice'

  return (
    <div className="space-y-5">
      {documentsFirst ? documents : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lot" htmlFor={`${idPrefix}-lot`}>
          <Select
            id={`${idPrefix}-lot`}
            required
            disabled={disabled}
            value={form.lot_id}
            onChange={(event) => onFieldChange('lot_id', event.target.value)}
          >
            {form.lot_id === '' ? (
              <option value="" disabled>
                Choisir un lot
              </option>
            ) : null}
            {lots.map((lot) => (
              <option key={lot.id} value={String(lot.id)}>
                {lotLabel(lot)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Libellé" htmlFor={`${idPrefix}-title`}>
          <Input
            id={`${idPrefix}-title`}
            maxLength={TITLE_MAX_LENGTH}
            disabled={disabled}
            value={form.title}
            onChange={(event) => onFieldChange('title', event.target.value)}
          />
        </Field>
      </div>

      <TtcAmountField
        idPrefix={idPrefix}
        form={form}
        disabled={disabled}
        onChange={onFieldChange}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fournisseur" htmlFor={`${idPrefix}-supplier`}>
          <SupplierSelectField
            id={`${idPrefix}-supplier`}
            value={form.supplier_id}
            suppliers={suppliers}
            disabled={disabled}
            onChange={(supplierId) => onFieldChange('supplier_id', supplierId)}
          />
        </Field>
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

      <DetailsDisclosure
        label="Plus de détails"
        defaultOpen={detailsOpenByDefault}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Référence" htmlFor={`${idPrefix}-reference`}>
            <Input
              id={`${idPrefix}-reference`}
              maxLength={REFERENCE_MAX_LENGTH}
              disabled={disabled}
              value={form.reference}
              onChange={(event) =>
                onFieldChange('reference', event.target.value)
              }
            />
          </Field>
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
            <Field label="Type de facture" htmlFor={`${idPrefix}-invoice-type`}>
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
        <Field label="Notes" htmlFor={`${idPrefix}-description`}>
          <Input
            id={`${idPrefix}-description`}
            disabled={disabled}
            value={form.description}
            onChange={(event) =>
              onFieldChange('description', event.target.value)
            }
          />
        </Field>
        {documentsFirst ? null : documents}
        {footnote}
      </DetailsDisclosure>
    </div>
  )
}
