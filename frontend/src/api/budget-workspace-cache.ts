import type { QueryClient } from '@tanstack/react-query'

import { budgetLineQueryKeys } from '@/api/budget-lines'
import { documentQueryKeys } from '@/api/documents'
import { projectQueryKeys } from '@/api/projects'
import { supplierQueryKeys } from '@/api/suppliers'
import { trashQueryKeys } from '@/api/trash'
import { transactionQueryKeys } from '@/api/transactions'

export function invalidateBudgetWorkspaceQueries(
  queryClient: QueryClient,
  projectId: number,
  budgetLineId?: number,
) {
  void queryClient.invalidateQueries({
    queryKey: projectQueryKeys.detail(projectId),
  })
  void queryClient.invalidateQueries({
    queryKey: projectQueryKeys.financialSummary(projectId),
  })
  void queryClient.invalidateQueries({
    queryKey: budgetLineQueryKeys.projectList(projectId),
  })
  void queryClient.invalidateQueries({
    queryKey: [...projectQueryKeys.all, projectId, 'dashboard'],
  })

  if (budgetLineId) {
    void queryClient.invalidateQueries({
      queryKey: transactionQueryKeys.projectList(projectId),
    })
    void queryClient.invalidateQueries({
      queryKey: transactionQueryKeys.budgetLineList(projectId, budgetLineId),
    })
  } else {
    void queryClient.invalidateQueries({
      queryKey: transactionQueryKeys.all,
    })
  }
}

export function invalidateTrashAffectedQueries(
  queryClient: QueryClient,
  projectId: number,
  transactionId?: number,
) {
  void queryClient.invalidateQueries({
    queryKey: trashQueryKeys.projectList(projectId),
  })
  invalidateBudgetWorkspaceQueries(queryClient, projectId)
  void queryClient.invalidateQueries({
    queryKey: supplierQueryKeys.lists(),
  })

  if (transactionId) {
    invalidateDocumentQueries(queryClient, transactionId)
  } else {
    void queryClient.invalidateQueries({
      queryKey: documentQueryKeys.lists(),
    })
    void queryClient.invalidateQueries({
      queryKey: transactionQueryKeys.all,
    })
    void queryClient.invalidateQueries({
      queryKey: projectQueryKeys.all,
      predicate: (query) => query.queryKey.some((part) => part === 'dashboard'),
    })
  }
}

export function invalidateDocumentQueries(
  queryClient: QueryClient,
  transactionId: number,
) {
  void queryClient.invalidateQueries({
    queryKey: documentQueryKeys.lists(),
  })
  void queryClient.invalidateQueries({
    queryKey: documentQueryKeys.byTransaction(transactionId),
  })
  void queryClient.invalidateQueries({
    queryKey: transactionQueryKeys.all,
  })
  void queryClient.invalidateQueries({
    queryKey: projectQueryKeys.all,
    predicate: (query) => query.queryKey.some((part) => part === 'dashboard'),
  })
}
