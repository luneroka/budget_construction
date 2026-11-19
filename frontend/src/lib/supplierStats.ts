import type {
  FinancialTotalsRead,
  LotFinancialSummaryRead,
  ProjectFinancialSummaryRead,
} from '@/api/types'
import { decimalToNumber } from '@/lib/apiAdapters'
import { formatCurrency } from '@/lib/format'

// The money figures of a supplier, a supplier in a lot or a lot, as the API
// computes them (the financial summary): nothing is recomputed here.
export type MoneyFigures = {
  /** « Coût prévu »: per lot, the larger of the validated quotes and the invoices. */
  plannedTtc: number
  /** « Devis validés », a reference figure. */
  validatedQuotesTtc: number
  invoicedTtc: number
  paidTtc: number
  /** « À payer »: the unpaid and on-hold invoices. */
  toPayTtc: number
  quoteCount: number
  invoiceCount: number
}

export const EMPTY_FIGURES: MoneyFigures = {
  plannedTtc: 0,
  validatedQuotesTtc: 0,
  invoicedTtc: 0,
  paidTtc: 0,
  toPayTtc: 0,
  quoteCount: 0,
  invoiceCount: 0,
}

// A group the API does not list (a supplier without an active transaction)
// is all zeros.
export function moneyFigures(
  totals: FinancialTotalsRead | undefined,
): MoneyFigures {
  if (!totals) return EMPTY_FIGURES
  return {
    plannedTtc: decimalToNumber(totals.planned_cost_ttc),
    validatedQuotesTtc: decimalToNumber(totals.validated_quote_amount_ttc),
    invoicedTtc: decimalToNumber(totals.invoiced_amount_ttc),
    paidTtc: decimalToNumber(totals.paid_invoice_amount_ttc),
    toPayTtc: decimalToNumber(totals.to_pay_amount_ttc),
    quoteCount: totals.quote_count,
    invoiceCount: totals.invoice_count,
  }
}

/** A supplier over the project's visible lots: the supplier page's Bilan. */
export function supplierFigures(
  summary: ProjectFinancialSummaryRead | undefined,
  supplierId: string | number,
): MoneyFigures {
  return moneyFigures(
    summary?.suppliers.find(
      (row) => String(row.supplier_id) === String(supplierId),
    ),
  )
}

/** One supplier card of a lot page; null is « Sans fournisseur ». */
export function lotSupplierFigures(
  lot: LotFinancialSummaryRead | undefined,
  supplierId: string | null,
): MoneyFigures {
  return moneyFigures(
    lot?.suppliers.find((group) =>
      supplierId === null
        ? group.supplier_id === null
        : String(group.supplier_id) === supplierId,
    ),
  )
}

// The payment bar: how much of what has been invoiced is paid. Null when
// nothing is invoiced yet, which the caller shows as an empty state.
export function paymentProgress(
  figures: Pick<MoneyFigures, 'invoicedTtc' | 'paidTtc'>,
): { value: number; max: number; label: string } | null {
  if (figures.invoicedTtc <= 0) return null
  return {
    value: figures.paidTtc,
    max: figures.invoicedTtc,
    label: `${formatCurrency(figures.paidTtc)} payés sur ${formatCurrency(
      figures.invoicedTtc,
    )} facturés`,
  }
}
