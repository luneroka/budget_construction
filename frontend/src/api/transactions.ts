import { useMutation, useQuery } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import { apiConfig } from './config'
import type {
  TransactionCreate,
  TransactionCreateForProduct,
  TransactionRead,
  TransactionUpdate,
} from './types'

export const transactionQueryKeys = {
  all: ['transactions'] as const,
  budgetLine: (projectId: number, budgetLineId: number) =>
    [
      ...transactionQueryKeys.all,
      'project',
      projectId,
      'budget-line',
      budgetLineId,
    ] as const,
  budgetLineList: (projectId: number, budgetLineId: number) =>
    [...transactionQueryKeys.budgetLine(projectId, budgetLineId), 'list'] as const,
  detail: (projectId: number, budgetLineId: number, transactionId: number) =>
    [
      ...transactionQueryKeys.budgetLine(projectId, budgetLineId),
      transactionId,
      'detail',
    ] as const,
}

export function getBudgetLineTransactions(
  projectId: number,
  budgetLineId: number,
): Promise<TransactionRead[]> {
  return apiGet<TransactionRead[]>(
    `/projects/${projectId}/budget-lines/${budgetLineId}/transactions/`,
  )
}

export function getBudgetLineTransaction(
  projectId: number,
  budgetLineId: number,
  transactionId: number,
): Promise<TransactionRead> {
  return apiGet<TransactionRead>(
    `/projects/${projectId}/budget-lines/${budgetLineId}/transactions/${transactionId}`,
  )
}

export function createBudgetLineTransaction(
  projectId: number,
  budgetLineId: number,
  transaction: TransactionCreate,
): Promise<TransactionRead> {
  return apiPost<TransactionRead, TransactionCreate>(
    `/projects/${projectId}/budget-lines/${budgetLineId}/transactions/`,
    transaction,
  )
}

export function createProductTransaction(
  projectId: number,
  productId: number,
  transaction: TransactionCreateForProduct,
): Promise<TransactionRead> {
  return apiPost<TransactionRead, TransactionCreateForProduct>(
    `/projects/${projectId}/products/${productId}/transactions/`,
    transaction,
  )
}

export function updateBudgetLineTransaction(
  projectId: number,
  budgetLineId: number,
  transactionId: number,
  transaction: TransactionUpdate,
): Promise<TransactionRead> {
  return apiPatch<TransactionRead, TransactionUpdate>(
    `/projects/${projectId}/budget-lines/${budgetLineId}/transactions/${transactionId}`,
    transaction,
  )
}

export function deleteBudgetLineTransaction(
  projectId: number,
  budgetLineId: number,
  transactionId: number,
): Promise<TransactionRead> {
  return apiDelete<TransactionRead>(
    `/projects/${projectId}/budget-lines/${budgetLineId}/transactions/${transactionId}`,
  )
}

export function selectBudgetCandidate(
  projectId: number,
  budgetLineId: number,
  transactionId: number,
): Promise<TransactionRead> {
  return apiPost<TransactionRead, undefined>(
    `/projects/${projectId}/budget-lines/${budgetLineId}/transactions/${transactionId}/select-budget`,
    undefined,
  )
}

export function unselectBudgetCandidate(
  projectId: number,
  budgetLineId: number,
  transactionId: number,
): Promise<TransactionRead> {
  return apiDelete<TransactionRead>(
    `/projects/${projectId}/budget-lines/${budgetLineId}/transactions/${transactionId}/select-budget`,
  )
}

export function useBudgetLineTransactionsQuery(
  projectId: number | null,
  budgetLineId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null || budgetLineId === null
        ? [...transactionQueryKeys.all, 'missing-budget-line', 'list']
        : transactionQueryKeys.budgetLineList(projectId, budgetLineId),
    queryFn: () => {
      if (projectId === null || budgetLineId === null) {
        throw new Error('Project id and budget line id are required')
      }

      return getBudgetLineTransactions(projectId, budgetLineId)
    },
    enabled:
      projectId !== null &&
      budgetLineId !== null &&
      (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useBudgetLineTransactionQuery(
  projectId: number | null,
  budgetLineId: number | null,
  transactionId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null || budgetLineId === null || transactionId === null
        ? [...transactionQueryKeys.all, 'missing-transaction', 'detail']
        : transactionQueryKeys.detail(projectId, budgetLineId, transactionId),
    queryFn: () => {
      if (
        projectId === null ||
        budgetLineId === null ||
        transactionId === null
      ) {
        throw new Error(
          'Project id, budget line id, and transaction id are required',
        )
      }

      return getBudgetLineTransaction(projectId, budgetLineId, transactionId)
    },
    enabled:
      projectId !== null &&
      budgetLineId !== null &&
      transactionId !== null &&
      (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useCreateBudgetLineTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLineId,
      transaction,
    }: {
      projectId: number
      budgetLineId: number
      transaction: TransactionCreate
    }) => createBudgetLineTransaction(projectId, budgetLineId, transaction),
  })
}

export function useCreateProductTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      productId,
      transaction,
    }: {
      projectId: number
      productId: number
      transaction: TransactionCreateForProduct
    }) => createProductTransaction(projectId, productId, transaction),
  })
}

export function useUpdateBudgetLineTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLineId,
      transactionId,
      transaction,
    }: {
      projectId: number
      budgetLineId: number
      transactionId: number
      transaction: TransactionUpdate
    }) =>
      updateBudgetLineTransaction(
        projectId,
        budgetLineId,
        transactionId,
        transaction,
      ),
  })
}

export function useDeleteBudgetLineTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLineId,
      transactionId,
    }: {
      projectId: number
      budgetLineId: number
      transactionId: number
    }) => deleteBudgetLineTransaction(projectId, budgetLineId, transactionId),
  })
}

export function useSelectBudgetCandidateMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLineId,
      transactionId,
    }: {
      projectId: number
      budgetLineId: number
      transactionId: number
    }) => selectBudgetCandidate(projectId, budgetLineId, transactionId),
  })
}

export function useUnselectBudgetCandidateMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLineId,
      transactionId,
    }: {
      projectId: number
      budgetLineId: number
      transactionId: number
    }) => unselectBudgetCandidate(projectId, budgetLineId, transactionId),
  })
}
