import { useState } from 'react'

import type {
  BudgetLineSummaryViewModel,
  ProductSummaryViewModel,
  TransactionViewModel,
} from '@/demo/types'
import {
  applyBudgetSelection,
  canToggleBudgetSelection,
  createBudgetSelections,
  isSelectedBudgetTransaction,
  type BudgetSelectionState,
} from '@/lib/budgetViewModel'

export function useBudgetSelections(products: ProductSummaryViewModel[]) {
  const [budgetSelections, setBudgetSelections] = useState<
    Record<string, BudgetSelectionState>
  >(() => createBudgetSelections(products))

  function getBudgetSelection(line: BudgetLineSummaryViewModel) {
    return (
      budgetSelections[line.budget_line_id] ?? {
        selected_quote_transaction_id: line.selected_quote_transaction_id,
        selected_diy_estimate_transaction_id:
          line.selected_diy_estimate_transaction_id,
      }
    )
  }

  function getLineWithBudgetSelection(line: BudgetLineSummaryViewModel) {
    return applyBudgetSelection(line, getBudgetSelection(line))
  }

  function toggleBudgetSelection(
    line: BudgetLineSummaryViewModel,
    transaction: TransactionViewModel,
  ) {
    if (!canToggleBudgetSelection(transaction)) return

    setBudgetSelections((current) => {
      const currentSelection =
        current[line.budget_line_id] ?? getBudgetSelection(line)
      const isSelected = isSelectedBudgetTransaction(
        transaction,
        currentSelection,
      )
      const nextSelection: BudgetSelectionState = { ...currentSelection }

      if (transaction.transaction_type === 'quote') {
        nextSelection.selected_quote_transaction_id = isSelected
          ? null
          : transaction.id
      }

      if (transaction.transaction_type === 'diy_estimate') {
        nextSelection.selected_diy_estimate_transaction_id = isSelected
          ? null
          : transaction.id
      }

      return {
        ...current,
        [line.budget_line_id]: nextSelection,
      }
    })
  }

  return {
    getBudgetSelection,
    getLineWithBudgetSelection,
    toggleBudgetSelection,
  }
}
