import type { QueryClient } from '@tanstack/react-query'

import { budgetLineQueryKeys } from '@/api/budget-lines'
import { documentQueryKeys } from '@/api/documents'
import { projectQueryKeys } from '@/api/projects'
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

  if (budgetLineId) {
    void queryClient.invalidateQueries({
      queryKey: transactionQueryKeys.budgetLineList(projectId, budgetLineId),
    })
  } else {
    void queryClient.invalidateQueries({
      queryKey: transactionQueryKeys.all,
    })
  }
}

export function invalidateDocumentQueries(
  queryClient: QueryClient,
  transactionId: number,
) {
  void queryClient.invalidateQueries({
    queryKey: documentQueryKeys.byTransaction(transactionId),
  })
}
