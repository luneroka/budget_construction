import type { QueryClient } from '@tanstack/react-query'

import { documentQueryKeys } from '@/api/documents'
import { lotQueryKeys } from '@/api/lots'
import { projectQueryKeys } from '@/api/projects'
import { supplierQueryKeys } from '@/api/suppliers'
import { trashQueryKeys } from '@/api/trash'
import { transactionQueryKeys } from '@/api/transactions'

// Everything a change to a project's transactions or lots can move: its
// totals, its dashboard, its lots (counts, visibility), its supplier <-> lot
// assignments and its transaction list.
export function invalidateProjectFinancialQueries(
  queryClient: QueryClient,
  projectId: number,
) {
  void queryClient.invalidateQueries({
    queryKey: projectQueryKeys.detail(projectId),
  })
  void queryClient.invalidateQueries({
    queryKey: projectQueryKeys.financialSummary(projectId),
  })
  void queryClient.invalidateQueries({
    queryKey: [...projectQueryKeys.all, projectId, 'dashboard'],
  })
  void queryClient.invalidateQueries({
    queryKey: lotQueryKeys.project(projectId),
  })
  void queryClient.invalidateQueries({
    queryKey: transactionQueryKeys.projectList(projectId),
  })
}

export function invalidateTrashAffectedQueries(
  queryClient: QueryClient,
  projectId: number,
  transactionId?: number,
) {
  void queryClient.invalidateQueries({
    queryKey: trashQueryKeys.projectList(projectId),
  })
  invalidateProjectFinancialQueries(queryClient, projectId)
  void queryClient.invalidateQueries({
    queryKey: documentQueryKeys.lists(),
  })
  void queryClient.invalidateQueries({
    queryKey: supplierQueryKeys.lists(),
  })

  if (transactionId) {
    invalidateDocumentQueries(queryClient, transactionId)
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
