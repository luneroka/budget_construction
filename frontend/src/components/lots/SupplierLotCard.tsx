import {
  ArrowUpRight,
  ChevronDown,
  FileText,
  Files,
  Plus,
  ReceiptText,
  Trash2,
  Unlink,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'

import { invoiceTypeLabels } from '@/components/budget/transaction-form/transactionForm'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card } from '@/components/ui/card'
import type { Transaction } from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'
import type { MoneyFigures } from '@/lib/supplierStats'
import { transactionTypeLabels } from '@/lib/transactionWorkspace'
import { cn } from '@/lib/utils'

type Section = 'quotes' | 'invoices'

// One grid per section, shared by its header and its rows so the total sits
// over the amounts: what the transaction is (its libellé, then its référence
// and date), its amount, its status, then its icons, in a column as wide as
// the section's add button above it.
const sectionGrid =
  'grid min-w-[30rem] grid-cols-[minmax(0,1fr)_6rem_6rem_6.5rem] items-center gap-x-[clamp(0.5rem,3cqi,2rem)] pr-2'

const deleteLabels: Record<Transaction['transaction_type'], string> = {
  quote: 'Supprimer le devis',
  invoice: 'Supprimer la facture',
}

const sectionTexts: Record<Section, { title: string; empty: string }> = {
  quotes: { title: 'Devis', empty: 'Aucun devis' },
  invoices: { title: 'Factures', empty: 'Aucune facture' },
}

export type SupplierLotCardProps = {
  /** null: the « Sans fournisseur » card. */
  supplierId: string | null
  supplierName: string
  /** The API's figures for this supplier in this lot. */
  figures: MoneyFigures
  /** This supplier's Prévu as a share of the lot's, 0–100; null when the lot plans nothing. */
  plannedShare: number | null
  transactions: Transaction[]
  readOnly?: boolean
  onAdd: (transactionType: 'quote' | 'invoice') => void
  onView: (transaction: Transaction) => void
  onViewDocuments: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  onAddInvoiceForQuote: (quote: Transaction) => void
  /** Offered while the supplier has no transaction left in the lot. */
  onUnassign?: () => void
}

function IconButton({
  label,
  tone = 'gold',
  onClick,
  children,
}: {
  label: string
  tone?: 'gold' | 'destructive'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors',
        tone === 'gold'
          ? 'hover:bg-gold/15 hover:text-gold'
          : 'hover:bg-destructive/10 hover:text-destructive',
      )}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  )
}

function AddTransactionButton({
  transactionType,
  onClick,
}: {
  transactionType: 'quote' | 'invoice'
  onClick: () => void
}) {
  const isQuote = transactionType === 'quote'

  return (
    <Button
      size="sm"
      variant="ghost"
      // Fills its header cell edge to edge, square, so the add action reads
      // as part of the section header rather than a button floating in it.
      className="h-full w-full rounded-none bg-gold/15 text-gold hover:bg-gold/25 hover:text-gold"
      aria-label={isQuote ? 'Ajouter un devis' : 'Ajouter une facture'}
      onClick={onClick}
    >
      <Plus aria-hidden="true" />
      {isQuote ? 'Devis' : 'Facture'}
    </Button>
  )
}

function TransactionSection({
  section,
  totalTtc,
  action,
  children,
}: {
  section: Section
  totalTtc: number
  action: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-label={sectionTexts[section].title}
      className={cn(
        '@container min-w-0 overflow-x-auto border-x border-b border-border bg-background/70',
        section === 'quotes' && 'border-b-0 @min-[66rem]:border-b',
      )}
    >
      <div
        className={cn(
          sectionGrid,
          'border-t-2 border-b border-border bg-muted',
        )}
      >
        <div className="px-2.5 py-3 text-[11px] font-bold tracking-wide text-foreground uppercase">
          {sectionTexts[section].title}
        </div>
        <div className="px-2 py-3 text-right font-bold whitespace-nowrap text-foreground">
          {formatCurrency(totalTtc)}
        </div>
        <div />
        <div className="-mr-2 self-stretch">{action}</div>
      </div>
      {children}
    </section>
  )
}

function TransactionRow({
  section,
  transaction,
  readOnly,
  onView,
  onViewDocuments,
  onDelete,
  onAddInvoiceForQuote,
}: Omit<
  SupplierLotCardProps,
  | 'supplierId'
  | 'supplierName'
  | 'figures'
  | 'plannedShare'
  | 'transactions'
  | 'onAdd'
> & {
  section: Section
  transaction: Transaction
}) {
  const status = transaction.quote_status ?? transaction.invoice_status
  const isRejected = transaction.quote_status === 'rejected'
  // The card already names the supplier: a row is named by its libellé.
  const title =
    transaction.title?.trim() ||
    transactionTypeLabels[transaction.transaction_type]
  const details = [
    transaction.reference,
    formatDate(transaction.issued_date),
    section === 'invoices' &&
    transaction.invoice_type &&
    transaction.invoice_type !== 'full'
      ? invoiceTypeLabels[transaction.invoice_type]
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        sectionGrid,
        'cursor-pointer border-t border-border/40 transition-colors hover:bg-muted/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isRejected && 'text-muted-foreground',
      )}
      // The whole row opens the transaction. Its buttons keep their own job,
      // and a click that ends a text selection (copying a name) is left alone.
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button'))
          return
        if (window.getSelection()?.toString()) return
        onView(transaction)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onView(transaction)
      }}
    >
      <div className="min-w-0 px-2.5 py-1.5">
        <span className="block leading-4 font-medium wrap-break-word">
          {title}
        </span>
        <span className="block text-[11px] leading-4 text-muted-foreground">
          {details}
        </span>
      </div>
      <div className="px-2 text-right font-medium whitespace-nowrap">
        {formatCurrency(transaction.amount_ttc)}
      </div>
      <div className="px-2 whitespace-nowrap">
        {status ? <StatusBadge status={status} dimmed={isRejected} /> : null}
      </div>
      <div className="flex justify-end gap-1">
        {section === 'quotes' && !readOnly && !isRejected ? (
          <IconButton
            label="Ajouter une facture pour ce devis"
            onClick={() => onAddInvoiceForQuote(transaction)}
          >
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        ) : null}
        {transaction.document_state === 'attached' ? (
          <IconButton
            label={
              transaction.document_count > 1
                ? 'Voir les documents'
                : 'Voir le document'
            }
            onClick={() => onViewDocuments(transaction)}
          >
            {transaction.document_count > 1 ? (
              <Files className="h-4 w-4" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
          </IconButton>
        ) : null}
        {readOnly ? null : (
          <IconButton
            label={deleteLabels[transaction.transaction_type]}
            tone="destructive"
            onClick={() => onDelete(transaction)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </div>
  )
}

function SectionMessage({ children }: { children: ReactNode }) {
  return (
    <div className={cn(sectionGrid, 'border-t border-border/40')}>
      <div className="col-span-full px-2.5 py-2 text-muted-foreground">
        {children}
      </div>
    </div>
  )
}

function sumTtc(transactions: Transaction[]) {
  return transactions.reduce(
    (total, transaction) => total + transaction.amount_ttc,
    0,
  )
}

// One supplier in one lot: its quotes and its invoices, side by side when
// the card is wide enough, stacked otherwise.
export function SupplierLotCard(props: SupplierLotCardProps) {
  const {
    supplierId,
    supplierName,
    figures,
    plannedShare,
    transactions,
    readOnly,
    onAdd,
    onUnassign,
  } = props
  const quotes = transactions.filter(
    (transaction) => transaction.transaction_type === 'quote',
  )
  const invoices = transactions.filter(
    (transaction) => transaction.transaction_type === 'invoice',
  )
  const [isOpen, setIsOpen] = useState(false)

  function rows(section: Section, sectionTransactions: Transaction[]) {
    if (sectionTransactions.length === 0) {
      return <SectionMessage>{sectionTexts[section].empty}</SectionMessage>
    }

    return sectionTransactions.map((transaction) => (
      <TransactionRow
        key={transaction.id}
        {...props}
        section={section}
        transaction={transaction}
      />
    ))
  }

  return (
    <Card className="overflow-hidden">
      <div
        className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4"
        // The whole header folds the card; its link and buttons keep their job.
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('a, button')
          )
            return
          setIsOpen((open) => !open)
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={
              isOpen ? `Replier ${supplierName}` : `Déplier ${supplierName}`
            }
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                !isOpen && '-rotate-90',
              )}
              aria-hidden="true"
            />
          </button>
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-body)] text-lg font-semibold text-foreground">
              {supplierName}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-5 gap-y-0.5 text-sm text-muted-foreground">
              <span>
                Prévu{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCurrency(figures.plannedTtc)}
                </span>
                {plannedShare !== null ? (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium tabular-nums">
                    {Math.round(plannedShare)} % du lot
                  </span>
                ) : null}
              </span>
              <span>
                Facturé{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCurrency(figures.invoicedTtc)}
                </span>
              </span>
              <span>
                À payer{' '}
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    figures.toPayTtc !== 0 ? 'text-gold' : 'text-foreground',
                  )}
                >
                  {formatCurrency(figures.toPayTtc)}
                </span>
              </span>
              {isOpen ? null : (
                <span className="text-xs">
                  {quotes.length} devis · {invoices.length} facture
                  {invoices.length > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOpen && supplierId !== null ? (
            <Link
              to={`/suppliers/${supplierId}`}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <ArrowUpRight aria-hidden="true" />
              Aller au fournisseur
            </Link>
          ) : null}
          {onUnassign && !readOnly ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Retirer ${supplierName} de ce lot`}
              onClick={onUnassign}
            >
              <Unlink aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          '@container min-w-0 px-5 pb-5 text-xs',
          !isOpen && 'hidden',
        )}
      >
        <div className="grid @min-[66rem]:grid-cols-2 @min-[66rem]:gap-4">
          <TransactionSection
            section="quotes"
            totalTtc={sumTtc(quotes)}
            action={
              readOnly ? null : (
                <AddTransactionButton
                  transactionType="quote"
                  onClick={() => onAdd('quote')}
                />
              )
            }
          >
            {rows('quotes', quotes)}
          </TransactionSection>
          <TransactionSection
            section="invoices"
            totalTtc={sumTtc(invoices)}
            action={
              readOnly ? null : (
                <AddTransactionButton
                  transactionType="invoice"
                  onClick={() => onAdd('invoice')}
                />
              )
            }
          >
            {rows('invoices', invoices)}
          </TransactionSection>
        </div>
      </div>
    </Card>
  )
}
