import { useMemo, useState } from 'react'

import { BudgetSummaryCards } from '@/components/budget/BudgetSummaryCards'
import { BudgetTree } from '@/components/budget/BudgetTree'
import { DeleteTransactionDialog } from '@/components/budget/DeleteTransactionDialog'
import { ProductStructureDialog } from '@/components/budget/ProductStructureDialog'
import {
  TransactionModal,
  TransactionReviewModal,
} from '@/components/budget/TransactionModal'
import type {
  ActiveAction,
  BreakdownAction,
  ProductStructureChoice,
  TransactionDeleteState,
  TransactionReviewState,
  TransactionAction,
} from '@/components/budget/types'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  budgetWorkspaceViewModel,
  supplierTableViewModel,
} from '@/demo/demo-data'
import { useBudgetSelections } from '@/hooks/useBudgetSelections'
import {
  canToggleBudgetSelection,
  isSelectedBudgetTransaction,
} from '@/lib/budgetViewModel'

export function BudgetPage() {
  const { categories, financialSummary, project, transactions } =
    budgetWorkspaceViewModel
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
  const [transactionDelete, setTransactionDelete] =
    useState<TransactionDeleteState | null>(null)
  const [selectedStructureChoice, setSelectedStructureChoice] =
    useState<ProductStructureChoice>('single')
  const {
    getBudgetSelection,
    getLineWithBudgetSelection,
    toggleBudgetSelection,
  } = useBudgetSelections(financialSummary.products)

  const visibleCounts = useMemo(
    () => ({
      categories: categories.length,
      products: financialSummary.products.length,
      transactions: transactions.length,
    }),
    [categories.length, financialSummary.products.length, transactions.length],
  )

  function openTransactionAction(action: TransactionAction) {
    setActiveAction({ kind: 'transaction', ...action })
  }

  function openStructureChoice(action: BreakdownAction) {
    setSelectedStructureChoice('single')
    setActiveAction({ kind: 'structure-choice', ...action })
  }

  function continueFromStructureChoice(action: BreakdownAction) {
    openTransactionAction({
      product: action.product,
      initialStructure: selectedStructureChoice,
    })
  }

  return (
    <section>
      <PageHeader
        title="Budget"
        description={`${project.name} · ${visibleCounts.categories} catégories, ${visibleCounts.products} produits et ${visibleCounts.transactions} transactions.`}
      />

      <BudgetSummaryCards summary={financialSummary} />

      <BudgetTree
        categories={categories}
        getBudgetSelection={getBudgetSelection}
        getLineWithBudgetSelection={getLineWithBudgetSelection}
        onAddBreakdown={(action) =>
          setActiveAction({ kind: 'breakdown', ...action })
        }
        onAddFirstTransaction={openStructureChoice}
        onAddTransaction={openTransactionAction}
        onDecomposeProduct={(action) =>
          setActiveAction({ kind: 'decompose-product', ...action })
        }
        onToggleBudgetSelection={toggleBudgetSelection}
        onRequestDeleteTransaction={setTransactionDelete}
        onEditTransaction={(context) =>
          setTransactionReview({
            context,
            initialMode: 'edit',
          })
        }
        onViewTransaction={(context) =>
          setTransactionReview({
            context,
            initialMode: 'view',
          })
        }
      />

      {activeAction?.kind === 'transaction' ? (
        <TransactionModal
          project={project}
          product={activeAction.product}
          budgetLine={activeAction.budgetLine}
          initialStructure={activeAction.initialStructure}
          suppliers={supplierTableViewModel.suppliers}
          onClose={() => setActiveAction(null)}
        />
      ) : null}

      {activeAction && activeAction.kind !== 'transaction' ? (
        <ProductStructureDialog
          activeAction={activeAction}
          selectedStructureChoice={selectedStructureChoice}
          onSelectStructureChoice={setSelectedStructureChoice}
          onContinue={continueFromStructureChoice}
          onClose={() => setActiveAction(null)}
        />
      ) : null}

      {transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview.context}
          initialMode={transactionReview.initialMode}
          suppliers={supplierTableViewModel.suppliers}
          isBudgetSelected={isSelectedBudgetTransaction(
            transactionReview.context.transaction,
            getBudgetSelection(transactionReview.context.budgetLine),
          )}
          canToggleBudgetSelection={canToggleBudgetSelection(
            transactionReview.context.transaction,
          )}
          onToggleBudgetSelection={() =>
            toggleBudgetSelection(
              transactionReview.context.budgetLine,
              transactionReview.context.transaction,
            )
          }
          onClose={() => setTransactionReview(null)}
        />
      ) : null}

      {transactionDelete ? (
        <DeleteTransactionDialog
          context={transactionDelete}
          onCancel={() => setTransactionDelete(null)}
          onConfirm={() => setTransactionDelete(null)}
        />
      ) : null}
    </section>
  )
}
