import { type ReactNode, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { AmountInput } from '@/components/ui/amount-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FilePickerButton } from '@/components/shared/FilePickerButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { AMOUNT_GROUP_SEPARATOR, formatAmountDisplay } from '@/lib/amountInput'
import { documentInputAccept, formatFileSize } from '@/lib/files'
import { cn } from '@/lib/utils'

import {
  type AmountFields,
  parseAmountInput,
  vatRatePresets,
} from './transactionForm'

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

// A caption for a group of controls rather than one input (a status switch):
// the same look and line box as Field's label, so both line up in a row.
export function FieldGroup({
  label,
  children,
}: {
  label: string
  children: (labelId: string) => ReactNode
}) {
  const labelId = useId()

  return (
    <div className="space-y-1.5">
      <span
        id={labelId}
        className="text-sm font-medium leading-none text-foreground"
      >
        {label}
      </span>
      <div>{children(labelId)}</div>
    </div>
  )
}

function formatRate(rate: string) {
  const value = parseAmountInput(rate)
  return value === null ? '' : `${String(value).replace('.', ',')} %`
}

// The amount a transaction is about: what is paid, TTC. HT and VAT follow
// from it and stay out of sight until the small link beside the label opens
// them.
export function TtcAmountField({
  idPrefix,
  form,
  disabled,
  onChange,
}: {
  idPrefix: string
  form: AmountFields
  disabled?: boolean
  onChange: (
    key: 'amount_ttc' | 'amount_ht' | 'vat_rate',
    value: string,
  ) => void
}) {
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const ttcId = `${idPrefix}-amount-ttc`
  const detailId = `${idPrefix}-amount-detail`
  const rateLabelId = `${idPrefix}-vat-rate-label`
  const rateValue = parseAmountInput(form.vat_rate)
  const matchingPreset =
    vatRatePresets.find((preset) => Number(preset) === rateValue) ?? null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={ttcId}>Montant TTC</Label>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          aria-expanded={isDetailOpen}
          aria-controls={detailId}
          onClick={() => setIsDetailOpen((current) => !current)}
        >
          {isDetailOpen
            ? 'Masquer HT / TVA'
            : disabled
              ? 'Voir HT / TVA'
              : 'Modifier HT / TVA'}
        </button>
      </div>
      <div className="relative mt-1.5">
        {/* The one field taller than 40px: the transaction's amount, alone
            on its row, leads the form. */}
        <AmountInput
          id={ttcId}
          placeholder={`0${AMOUNT_GROUP_SEPARATOR}000,00`}
          required
          disabled={disabled}
          value={form.amount_ttc}
          onValueChange={(value) => onChange('amount_ttc', value)}
          className="h-12 pr-10 text-2xl font-medium tabular-nums"
        />
        <span
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-lg text-muted-foreground"
          aria-hidden="true"
        >
          €
        </span>
      </div>
      {isDetailOpen ? (
        <div
          id={detailId}
          className="mt-3 space-y-3 rounded-md border border-border bg-muted/30 p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Montant HT" htmlFor={`${idPrefix}-amount-ht`}>
              <AmountInput
                id={`${idPrefix}-amount-ht`}
                disabled={disabled}
                value={form.amount_ht}
                onValueChange={(value) => onChange('amount_ht', value)}
                className="tabular-nums"
              />
            </Field>
            <Field label="Montant TVA" htmlFor={`${idPrefix}-amount-vat`}>
              <Input
                id={`${idPrefix}-amount-vat`}
                value={formatAmountDisplay(form.amount_vat, {
                  complete: true,
                })}
                readOnly
                disabled
                className="tabular-nums"
              />
            </Field>
          </div>
          <div className="space-y-1.5">
            <span
              id={rateLabelId}
              className="text-sm font-medium leading-none text-foreground"
            >
              Taux de TVA
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                aria-labelledby={rateLabelId}
                value={matchingPreset}
                disabled={disabled}
                options={vatRatePresets.map((preset) => ({
                  value: preset,
                  label: formatRate(preset),
                }))}
                onChange={(preset) => onChange('vat_rate', preset)}
              />
              <div className="relative w-28">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  aria-label="Autre taux de TVA"
                  disabled={disabled}
                  className="pr-8"
                  value={form.vat_rate}
                  onChange={(event) => onChange('vat_rate', event.target.value)}
                />
                <span
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                  aria-hidden="true"
                >
                  %
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function BudgetSelectionRow({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-sm',
        disabled ? 'cursor-not-allowed bg-muted/30' : 'cursor-pointer',
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="font-medium text-foreground">
        Sélectionner pour le calcul du budget
      </span>
    </label>
  )
}

export function DetailsDisclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
        {label}
      </button>
      {isOpen ? (
        <div id={contentId} className="mt-3 space-y-4">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function SelectedDocumentPreview({
  file,
  onClear,
}: {
  file: File
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">
          {file.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </span>
      </span>
      <Button size="sm" variant="ghost" type="button" onClick={onClear}>
        Retirer
      </Button>
    </div>
  )
}

export function NewTransactionDocumentField({
  file,
  disabled,
  onFileChange,
  onClear,
}: {
  file: File | null
  disabled?: boolean
  onFileChange: (file: File | null) => void
  onClear: () => void
}) {
  // A field like the others: its label, then the picker, or the picked file
  // with a way to take it back.
  return (
    <FieldGroup label="Document">
      {() =>
        file ? (
          <SelectedDocumentPreview file={file} onClear={onClear} />
        ) : (
          <FilePickerButton
            accept={documentInputAccept}
            disabled={disabled}
            onSelect={onFileChange}
          />
        )
      }
    </FieldGroup>
  )
}
