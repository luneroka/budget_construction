import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import type {
  BudgetLine,
  Product,
  Transaction,
} from '@/types'

export type ProductStructureChoice = 'single' | 'breakdown'

export type TransactionAction = {
  budgetLine?: BudgetLine
  product: Product
  initialStructure?: ProductStructureChoice
}

export type ViewTransactionDocumentsAction = {
  transaction: Transaction
}

export type BreakdownAction = {
  product: Product
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

export type BudgetLineDeleteState = {
  line: BudgetLine
  product: Product
}
