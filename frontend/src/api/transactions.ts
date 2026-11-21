import { useMutation, useQuery } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type {
  ProjectTransactionRead,
  TransactionCreate,
  TransactionRead,
  TransactionUpdate,
} from './types'

export const transactionQueryKeys = {
  all: ['transactions'] as const,
  project: (projectId: number) =>
    [...transactionQueryKeys.all, 'project', projectId] as const,
  projectList: (projectId: number) =>
    [...transactionQueryKeys.project(projectId), 'list'] as const,
}

function transactionsUrl(projectId: number) {
  return `/projects/${projectId}/transactions/`
}

export function getProjectTransactions(
  projectId: number,
): Promise<ProjectTransactionRead[]> {
  return apiGet<ProjectTransactionRead[]>(transactionsUrl(projectId))
}

export function createTransaction(
  projectId: number,
  transaction: TransactionCreate,
): Promise<ProjectTransactionRead> {
  return apiPost<ProjectTransactionRead, TransactionCreate>(
    transactionsUrl(projectId),
    transaction,
  )
}

export function updateTransaction(
  projectId: number,
  transactionId: number,
  transaction: TransactionUpdate,
): Promise<ProjectTransactionRead> {
  return apiPatch<ProjectTransactionRead, TransactionUpdate>(
    `${transactionsUrl(projectId)}${transactionId}`,
    transaction,
  )
}

export function deleteTransaction(
  projectId: number,
  transactionId: number,
): Promise<TransactionRead> {
  return apiDelete<TransactionRead>(
    `${transactionsUrl(projectId)}${transactionId}`,
  )
}

export function useProjectTransactionsQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [...transactionQueryKeys.all, 'missing-project', 'list']
        : transactionQueryKeys.projectList(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectTransactions(projectId)
    },
    enabled: projectId !== null && (options?.enabled ?? true),
  })
}

export function useCreateTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      transaction,
    }: {
      projectId: number
      transaction: TransactionCreate
    }) => createTransaction(projectId, transaction),
  })
}

export function useUpdateTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      transactionId,
      transaction,
    }: {
      projectId: number
      transactionId: number
      transaction: TransactionUpdate
    }) => updateTransaction(projectId, transactionId, transaction),
  })
}

export function useDeleteTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      transactionId,
    }: {
      projectId: number
      transactionId: number
    }) => deleteTransaction(projectId, transactionId),
  })
}
