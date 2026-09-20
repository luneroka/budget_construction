import { FileText, Files, Plus, ReceiptText, Trash2 } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { invalidateBudgetWorkspaceQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useBudgetLineTransactionsQuery,
  useSelectBudgetCandidateMutation,
  useUnselectBudgetCandidateMutation,
} from '@/api/transactions'
import { useSuppliersQuery } from '@/api/suppliers'
import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import {
  invoicePrefillFromQuote,
  invoiceTypeLabels,
  transactionTypeLabels,
} from '@/components/budget/transaction-form/transactionForm'
import type { TransactionAction } from '@/components/budget/types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import type { BudgetLine, Product, Transaction } from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'
import { transactionToDomain } from '@/lib/apiAdapters'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { canToggleBudgetSelection } from '@/lib/budgetDomain'
import { cn } from '@/lib/utils'

type Section = 'quotes' | 'invoices'

// One grid per section, shared by its header and its rows so the total sits
// over the amounts: what the transaction is (supplier, then type and date),
// its amount, its status, the budget choice for a quote, then its icons, in
// a column as wide as the section's add button above it. The rows keep a
// margin on the right so neither the button nor the icons touch the frame.
// The columns breathe with the section's width (3% of it, 8 to 32px): room
// to spare on a wide screen, never at the expense of a supplier's name at the
// side-by-side threshold. The minimum width keeps a name on a line or two on
// a phone, where the section scrolls sideways instead.
const sectionGrids: Record<Section, string> = {
  quotes:
    'grid min-w-[38rem] grid-cols-[minmax(0,1fr)_6rem_6rem_6.5rem_6rem] items-center gap-x-[clamp(0.5rem,3cqi,2rem)] pr-2',
  invoices:
    'grid min-w-[31rem] grid-cols-[minmax(0,1fr)_6rem_6rem_6rem] items-center gap-x-[clamp(0.5rem,3cqi,2rem)] pr-2',
}

const deleteLabels: Record<Transaction['transaction_type'], string> = {
  quote: 'Supprimer le devis',
  diy_estimate: 'Supprimer l’estimation',
  invoice: 'Supprimer la facture',
}

const sectionTexts: Record<Section, { title: string; empty: string }> = {
  quotes: { title: 'Devis', empty: 'Aucun devis' },
  invoices: { title: 'Factures', empty: 'Aucune facture' },
}

type TransactionsPanelProps = {
  transactions: Transaction[]
  budgetLine: BudgetLine
  projectId?: number
  product: Product
  readOnly?: boolean
  onToggleBudgetSelection: (
    budgetLine: BudgetLine,
    transaction: Transaction,
  ) => void
  onRequestDeleteTransaction: (context: ViewedTransactionContext) => void
  onViewTransaction: (context: ViewedTransactionContext) => void
  onViewTransactionDocuments: (transaction: Transaction) => void
  onAddTransaction?: (action: TransactionAction) => void
}

// Adding a quote or an invoice starts where the new row will appear: in the
// section it belongs to. An estimate is a quote's sibling, picked in the modal.
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

// Quotes and invoices side by side once the product is wide enough for both
// without squeezing a supplier's name: a quote row needs about 42rem and an
// invoice row 35rem, hence 78rem. Side by side, both frames take the taller
// one's height so the pair reads as one balanced block. Below 78rem they stack
// in one frame, the invoices' thick top rule separating them from the quotes.
function TransactionSections({
  quotes,
  invoices,
}: {
  quotes: ReactNode
  invoices: ReactNode
}) {
  return (
    <TableRow className="border-t-0 bg-muted/10 hover:bg-muted/10">
      <TableCell colSpan={7} className="max-w-0 p-0">
        <div className="@container min-w-0 px-6 pb-5">
          <div className="grid text-xs @min-[78rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @min-[78rem]:gap-4">
            {quotes}
            {invoices}
          </div>
        </div>
      </TableCell>
    </TableRow>
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
        // Stacked, the quotes' bottom edge would thicken the invoices' rule.
        section === 'quotes' && 'border-b-0 @min-[78rem]:border-b',
      )}
    >
      <div
        className={cn(
          sectionGrids[section],
          'border-t-2 border-b border-border bg-muted',
        )}
      >
        <div className="px-2.5 py-3 text-[11px] font-bold tracking-wide text-foreground uppercase">
          {sectionTexts[section].title}
        </div>
        <div className="px-2 py-3 text-right font-bold whitespace-nowrap text-foreground">
          {formatCurrency(totalTtc)}
        </div>
        <div className={section === 'quotes' ? 'col-span-2' : undefined} />
        {/* Stretched to the header's height and, through the rows' right
            margin, to the frame's border. */}
        <div className="-mr-2 self-stretch">{action}</div>
      </div>
      {children}
    </section>
  )
}

function SectionMessage({
  section,
  children,
}: {
  section: Section
  children: ReactNode
}) {
  return (
    <div className={cn(sectionGrids[section], 'border-t border-border/40')}>
      <div className="col-span-full px-2.5 py-2 text-muted-foreground">
        {children}
      </div>
    </div>
  )
}

type TransactionRowProps = Omit<TransactionsPanelProps, 'transactions'> & {
  section: Section
  transaction: Transaction
  lineTransactions: Transaction[]
}

function TransactionRow({
  section,
  transaction,
  lineTransactions,
  budgetLine,
  product,
  readOnly,
  onToggleBudgetSelection,
  onRequestDeleteTransaction,
  onViewTransaction,
  onViewTransactionDocuments,
  onAddTransaction,
}: TransactionRowProps) {
  const status = transaction.quote_status ?? transaction.invoice_status
  const isSelectedBudget = transaction.select_as_budget
  const canToggleSelection = canToggleBudgetSelection(transaction)
  const isUnretainedCandidate = section === 'quotes' && !isSelectedBudget
  const typeLabel = transactionTypeLabels[transaction.transaction_type]
  // Without a supplier (a self-built estimate), its description or its type
  // names it.
  const title =
    transaction.supplier_name || transaction.description || typeLabel
  const details = [
    title !== typeLabel ? typeLabel : null,
    formatDate(transaction.issued_date),
    section === 'invoices' &&
    transaction.invoice_type &&
    transaction.invoice_type !== 'full'
      ? invoiceTypeLabels[transaction.invoice_type]
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  function open() {
    onViewTransaction({ budgetLine, product, transaction })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        sectionGrids[section],
        'cursor-pointer border-t border-border/40 transition-colors hover:bg-muted/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        isUnretainedCandidate && 'text-muted-foreground',
      )}
      // The whole row opens the transaction. Its buttons keep their own job,
      // and a click that ends a text selection (copying a name) is left alone.
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button'))
          return
        if (window.getSelection()?.toString()) return
        open()
      }}
      // The keyboard's way in, now that the name is not a button.
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        open()
      }}
    >
      <div className="min-w-0 px-2.5 py-1.5">
        {/* Plain text: the row already opens the transaction, and a second
            target on the same line (beside the budget badge) only makes the
            row harder to read. */}
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
        {status ? (
          <StatusBadge status={status} dimmed={isUnretainedCandidate} />
        ) : null}
      </div>
      {section === 'quotes' ? (
        <div className="px-2 whitespace-nowrap">
          {isSelectedBudget ? (
            readOnly ? (
              <Badge variant="gold">Sélectionné</Badge>
            ) : (
              <button
                type="button"
                className="inline-flex"
                onClick={() => onToggleBudgetSelection(budgetLine, transaction)}
                aria-label="Retirer cette transaction du budget sélectionné"
              >
                <Badge variant="gold">Sélectionné</Badge>
              </button>
            )
          ) : (
            <button
              type="button"
              className={cn(
                'inline-flex',
                canToggleSelection && !readOnly
                  ? 'cursor-pointer'
                  : 'cursor-not-allowed opacity-75',
              )}
              disabled={!canToggleSelection || readOnly}
              onClick={() => onToggleBudgetSelection(budgetLine, transaction)}
              aria-label="Sélectionner cette transaction pour le budget"
            >
              <Badge variant="muted">Non retenu</Badge>
            </button>
          )}
        </div>
      ) : null}
      <div className="flex justify-end gap-1">
        {section === 'quotes' &&
        onAddTransaction &&
        !readOnly &&
        transaction.transaction_type === 'quote' &&
        transaction.quote_status !== 'rejected' ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
            onClick={() =>
              onAddTransaction({
                budgetLine,
                product,
                transactionType: 'invoice',
                prefill: invoicePrefillFromQuote(transaction, lineTransactions),
              })
            }
            aria-label="Ajouter une facture pour ce devis"
          >
            <ReceiptText className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        {transaction.document_state === 'attached' ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
            onClick={() => onViewTransactionDocuments(transaction)}
            aria-label={
              transaction.document_count > 1
                ? 'Voir les documents'
                : 'Voir le document'
            }
          >
            {/* Stacked sheets say "more than one here" at a glance, the
                same signal ccig-app's CerfaButton uses. */}
            {transaction.document_count > 1 ? (
              <Files className="h-4 w-4" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
        {readOnly ? null : (
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            onClick={() =>
              onRequestDeleteTransaction({ budgetLine, product, transaction })
            }
            aria-label={deleteLabels[transaction.transaction_type]}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}

export function TransactionsPanel(props: TransactionsPanelProps) {
  const queryClient = useQueryClient()
  const selectBudgetCandidateMutation = useSelectBudgetCandidateMutation()
  const unselectBudgetCandidateMutation = useUnselectBudgetCandidateMutation()
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const budgetLineId = Number(props.budgetLine.budget_line_id)
  const shouldUseApi =
    props.projectId !== undefined && Number.isInteger(budgetLineId)
  const transactionsQuery = useBudgetLineTransactionsQuery(
    props.projectId ?? null,
    shouldUseApi ? budgetLineId : null,
    { enabled: shouldUseApi },
  )
  const suppliersQuery = useSuppliersQuery({ enabled: shouldUseApi })
  const transactions = useMemo(() => {
    if (!shouldUseApi) return props.transactions

    return (transactionsQuery.data ?? []).map((transaction) =>
      transactionToDomain(transaction, suppliersQuery.data ?? []),
    )
  }, [
    props.transactions,
    shouldUseApi,
    suppliersQuery.data,
    transactionsQuery.data,
  ])
  const quotes = transactions.filter((transaction) =>
    ['quote', 'diy_estimate'].includes(transaction.transaction_type),
  )
  const invoices = transactions.filter(
    (transaction) => transaction.transaction_type === 'invoice',
  )
  const quotesTotalTtc = quotes.reduce(
    (total, transaction) => total + transaction.amount_ttc,
    0,
  )
  const invoicesTotalTtc = invoices.reduce(
    (total, transaction) => total + transaction.amount_ttc,
    0,
  )
  const isLoadingApiRows =
    shouldUseApi &&
    (transactionsQuery.isLoading ||
      transactionsQuery.isFetching ||
      suppliersQuery.isLoading ||
      suppliersQuery.isFetching)
  const apiError = transactionsQuery.error ?? suppliersQuery.error ?? null
  const isSelectionMutating =
    selectBudgetCandidateMutation.isPending ||
    unselectBudgetCandidateMutation.isPending
  const { onAddTransaction } = props
  const canAdd = onAddTransaction !== undefined && !props.readOnly

  async function handleToggleBudgetSelection(
    budgetLine: BudgetLine,
    transaction: Transaction,
  ) {
    if (!shouldUseApi || props.projectId === undefined) {
      props.onToggleBudgetSelection(budgetLine, transaction)
      return
    }

    const transactionId = Number(transaction.id)
    if (!Number.isInteger(transactionId)) {
      setSelectionError('Identifiant de transaction invalide.')
      return
    }

    try {
      setSelectionError(null)
      const isCurrentlySelected = transaction.select_as_budget
      if (isCurrentlySelected) {
        await unselectBudgetCandidateMutation.mutateAsync({
          projectId: props.projectId,
          budgetLineId,
          transactionId,
        })
      } else {
        await selectBudgetCandidateMutation.mutateAsync({
          projectId: props.projectId,
          budgetLineId,
          transactionId,
        })
      }
      invalidateBudgetWorkspaceQueries(
        queryClient,
        props.projectId,
        budgetLineId,
      )
      notifySuccess(
        isCurrentlySelected
          ? 'Transaction retirée du budget sélectionné.'
          : 'Transaction sélectionnée pour le budget.',
      )
    } catch (error) {
      const message = getApiErrorMessage(error)
      setSelectionError(message)
      notifyError(`Impossible de modifier la sélection budget. ${message}`)
    }
  }

  function renderRows(section: Section, sectionTransactions: Transaction[]) {
    if (isLoadingApiRows) {
      return (
        <SectionMessage section={section}>
          Chargement des transactions
        </SectionMessage>
      )
    }
    if (apiError) {
      return (
        <SectionMessage section={section}>
          {getApiErrorMessage(apiError)}
        </SectionMessage>
      )
    }
    if (sectionTransactions.length === 0) {
      return (
        <SectionMessage section={section}>
          {sectionTexts[section].empty}
        </SectionMessage>
      )
    }

    return sectionTransactions.map((transaction) => (
      <TransactionRow
        key={transaction.id}
        {...props}
        section={section}
        transaction={transaction}
        lineTransactions={transactions}
        readOnly={props.readOnly || isSelectionMutating}
        onToggleBudgetSelection={handleToggleBudgetSelection}
      />
    ))
  }

  return (
    <TransactionSections
      quotes={
        <TransactionSection
          section="quotes"
          totalTtc={quotesTotalTtc}
          action={
            canAdd ? (
              <AddTransactionButton
                transactionType="quote"
                onClick={() =>
                  onAddTransaction({
                    budgetLine: props.budgetLine,
                    product: props.product,
                    transactionType: 'quote',
                  })
                }
              />
            ) : null
          }
        >
          {selectionError ? (
            <SectionMessage section="quotes">{selectionError}</SectionMessage>
          ) : null}
          {renderRows('quotes', quotes)}
        </TransactionSection>
      }
      invoices={
        <TransactionSection
          section="invoices"
          totalTtc={invoicesTotalTtc}
          action={
            canAdd ? (
              <AddTransactionButton
                transactionType="invoice"
                onClick={() =>
                  onAddTransaction({
                    budgetLine: props.budgetLine,
                    product: props.product,
                    transactionType: 'invoice',
                  })
                }
              />
            ) : null
          }
        >
          {renderRows('invoices', invoices)}
        </TransactionSection>
      }
    />
  )
}

// A product with no transaction yet: the same two sections, empty, with the
// same two buttons, so the first quote or invoice starts the way every later
// one does.
export function EmptyTransactionsPanel({
  product,
  readOnly,
  onAddTransaction,
}: {
  product: Product
  readOnly?: boolean
  onAddTransaction: (action: TransactionAction) => void
}) {
  return (
    <TransactionSections
      quotes={
        <TransactionSection
          section="quotes"
          totalTtc={0}
          action={
            readOnly ? null : (
              <AddTransactionButton
                transactionType="quote"
                onClick={() =>
                  onAddTransaction({ product, transactionType: 'quote' })
                }
              />
            )
          }
        >
          <SectionMessage section="quotes">
            {sectionTexts.quotes.empty}
          </SectionMessage>
        </TransactionSection>
      }
      invoices={
        <TransactionSection
          section="invoices"
          totalTtc={0}
          action={
            readOnly ? null : (
              <AddTransactionButton
                transactionType="invoice"
                onClick={() =>
                  onAddTransaction({ product, transactionType: 'invoice' })
                }
              />
            )
          }
        >
          <SectionMessage section="invoices">
            {sectionTexts.invoices.empty}
          </SectionMessage>
        </TransactionSection>
      }
    />
  )
}
