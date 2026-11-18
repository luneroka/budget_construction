import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import type { TransactionPrefill } from '@/components/budget/transaction-form/transactionForm'
import type { TransactionType } from '@/types'

export type TransactionAction = {
  // The lot the new transaction starts in; the modal's picker can change it.
  lotId?: number
  transactionType: TransactionType
  prefill?: TransactionPrefill
}

export type TransactionReviewState = {
  context: ViewedTransactionContext
}

export type TransactionDeleteState = ViewedTransactionContext
