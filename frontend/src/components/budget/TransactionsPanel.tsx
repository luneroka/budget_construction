import { Edit3, Eye, Paperclip, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import type {
  BudgetLine,
  Product,
  Transaction,
} from '@/types'
import { formatCurrency, formatDate } from '@/lib/format'
import { transactionToDomain } from '@/lib/budgetWorkspaceApiAdapter'
import { notifyError, notifySuccess } from '@/lib/toasts'
import {
  canToggleBudgetSelection,
  formatSelectedBudgetSource,
} from '@/lib/budgetDomain'
import { cn } from '@/lib/utils'

const transactionGridClass =
  'grid min-w-[55rem] grid-cols-[5rem_8rem_minmax(10rem,1fr)_7rem_6.25rem_7rem_6rem_4rem] items-center'

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
  onEditTransaction: (context: ViewedTransactionContext) => void
  onViewTransaction: (context: ViewedTransactionContext) => void
  onViewTransactionDocuments: (transaction: Transaction) => void
}

function TransactionSectionDivider({ label }: { label: string }) {
  return (
    <div
      className={cn(transactionGridClass, 'border-y border-border bg-muted/55')}
    >
      <div className="col-span-8 px-2.5 py-2 text-[11px] font-bold tracking-normal text-foreground uppercase">
        {label}
      </div>
    </div>
  )
}

function EmptyTransactionRows() {
  return (
    <div className={cn(transactionGridClass, 'border-t border-border/40')}>
      <div className="col-span-8 px-2 py-2 text-muted-foreground">
        Aucune transaction
      </div>
    </div>
  )
}

function TransactionPanelMessage({ message }: { message: string }) {
  return (
    <div className={cn(transactionGridClass, 'border-t border-border/40')}>
      <div className="col-span-8 px-2 py-2 text-muted-foreground">
        {message}
      </div>
    </div>
  )
}

function TransactionRows({
  transactions,
  budgetLine,
  product,
  readOnly,
  onToggleBudgetSelection,
  onRequestDeleteTransaction,
  onEditTransaction,
  onViewTransaction,
  onViewTransactionDocuments,
}: TransactionsPanelProps) {
  if (transactions.length === 0) return <EmptyTransactionRows />

  return transactions.map((transaction) => {
    const financialStatus =
      transaction.quote_status ?? transaction.invoice_status
    const isSelectedBudget = transaction.select_as_budget
    const canToggleSelection = canToggleBudgetSelection(transaction)

    return (
      <div
        key={transaction.id}
        className={cn(
          transactionGridClass,
          'border-t border-border/40',
          isSelectedBudget && 'bg-gold/10',
        )}
      >
        <div className="px-1.5 py-2 whitespace-nowrap">
          {formatDate(transaction.issued_date)}
        </div>
        <div className="px-1.5 py-2 whitespace-nowrap">
          <StatusBadge status={transaction.transaction_type} />
        </div>
        <div className="min-w-0 px-2 py-2 leading-snug wrap-break-words">
          {transaction.supplier_name ?? 'Autoconstruction'}
        </div>
        <div className="px-3 py-2 text-right font-medium whitespace-nowrap">
          {formatCurrency(transaction.amount_ttc)}
        </div>
        <div className="px-3 py-2 whitespace-nowrap">
          {financialStatus ? (
            <StatusBadge status={financialStatus} />
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
        <div className="px-3 py-2 whitespace-nowrap">
          {transaction.transaction_type === 'invoice' ? (
            <span className="text-muted-foreground">-</span>
          ) : isSelectedBudget ? (
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
        <div className="px-1 py-2 text-center whitespace-nowrap">
          <div className="inline-flex justify-center gap-1">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
              onClick={() =>
                onViewTransaction({
                  budgetLine,
                  product,
                  transaction,
                })
              }
              aria-label="Voir la transaction"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
            </button>
            {readOnly ? null : (
              <>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
                  onClick={() =>
                    onEditTransaction({
                      budgetLine,
                      product,
                      transaction,
                    })
                  }
                  aria-label="Modifier la transaction"
                >
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  onClick={() =>
                    onRequestDeleteTransaction({
                      budgetLine,
                      product,
                      transaction,
                    })
                  }
                  aria-label="Supprimer la transaction"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="px-1 py-2 text-center whitespace-nowrap">
          {transaction.document_state === 'attached' ? (
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
              onClick={() => onViewTransactionDocuments(transaction)}
              aria-label="Voir les documents de la transaction"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    )
  })
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
  }, [props.transactions, shouldUseApi, suppliersQuery.data, transactionsQuery.data])
  const budgetCandidates = transactions.filter((transaction) =>
    ['quote', 'diy_estimate'].includes(transaction.transaction_type),
  )
  const invoices = transactions.filter(
    (transaction) => transaction.transaction_type === 'invoice',
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

  return (
    <TableRow className="border-t-0 bg-muted/10 hover:bg-muted/10!">
      <TableCell colSpan={7} className="max-w-0 p-0!">
        <div className="min-w-0 px-6 pb-5">
          <div className="w-full min-w-0 overflow-x-auto border border-border bg-background/70 text-xs">
            <div className="hidden border-t border-border/50 px-2 py-2">
              <p className="whitespace-nowrap font-medium text-foreground">
                Budget sélectionné{' '}
                {formatCurrency(props.budgetLine.selected_budget_amount_ttc)}
                <span className="ml-1 text-muted-foreground">
                  ({formatSelectedBudgetSource(transactions)})
                </span>
              </p>
            </div>
            <div className={transactionGridClass}>
              <div className="px-1.5 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Date
              </div>
              <div className="px-1.5 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Type
              </div>
              <div className="px-2 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Fournisseur
              </div>
              <div className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase">
                Montant TTC
              </div>
              <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Statut
              </div>
              <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Budget
              </div>
              <div className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
                Actions
              </div>
              <div className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
                Doc
              </div>
            </div>

            <TransactionSectionDivider label="Candidats budget" />
            {selectionError ? (
              <TransactionPanelMessage message={selectionError} />
            ) : null}
            {isLoadingApiRows ? (
              <TransactionPanelMessage message="Chargement des transactions" />
            ) : apiError ? (
              <TransactionPanelMessage message={getApiErrorMessage(apiError)} />
            ) : (
              <TransactionRows
                {...props}
                readOnly={props.readOnly || isSelectionMutating}
                transactions={budgetCandidates}
                onToggleBudgetSelection={handleToggleBudgetSelection}
              />
            )}

            <TransactionSectionDivider label="Dépenses réelles" />
            {isLoadingApiRows ? (
              <TransactionPanelMessage message="Chargement des transactions" />
            ) : apiError ? (
              <TransactionPanelMessage message={getApiErrorMessage(apiError)} />
            ) : (
              <TransactionRows
                {...props}
                readOnly={props.readOnly || isSelectionMutating}
                transactions={invoices}
                onToggleBudgetSelection={handleToggleBudgetSelection}
              />
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}
