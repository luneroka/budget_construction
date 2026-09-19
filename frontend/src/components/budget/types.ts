import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import type { TransactionPrefill } from '@/components/budget/transaction-form/transactionForm'
import type { BudgetLine, Product, Transaction, TransactionType } from '@/types'

export type TransactionAction = {
  // Without a line (a product with no transaction yet), the first quote or
  // invoice opens the product's single budget line.
  budgetLine?: BudgetLine
  product: Product
  transactionType: TransactionType
  prefill?: TransactionPrefill
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

export type TransactionReviewState = {
  context: ViewedTransactionContext
}

export type TransactionDeleteState = ViewedTransactionContext

export type BudgetLineDeleteState = {
  line: BudgetLine
  product: Product
}
