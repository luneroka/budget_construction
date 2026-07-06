import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import type {
  BudgetLineSummaryViewModel,
  ProductSummaryViewModel,
} from '@/demo/types'

export type ProductStructureChoice = 'single' | 'breakdown'

export type TransactionAction = {
  budgetLine?: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
  initialStructure?: ProductStructureChoice
}

export type BreakdownAction = {
  product: ProductSummaryViewModel
}

export type ActiveAction =
  | ({ kind: 'transaction' } & TransactionAction)
  | ({ kind: 'breakdown' } & BreakdownAction)
  | ({ kind: 'decompose-product' } & BreakdownAction)
  | ({ kind: 'structure-choice' } & BreakdownAction)

export type TransactionReviewState = {
  context: ViewedTransactionContext
  initialMode: 'view' | 'edit'
}

export type TransactionDeleteState = ViewedTransactionContext
