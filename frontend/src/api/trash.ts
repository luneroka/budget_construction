import { useMutation, useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiDelete, apiGet, apiPost } from './client'
import type {
  DocumentRead,
  SupplierRead,
  TransactionRead,
  TrashItemRead,
} from './types'

export const trashQueryKeys = {
  all: ['trash'] as const,
  project: (projectId: number) =>
    [...trashQueryKeys.all, 'project', projectId] as const,
  projectList: (projectId: number) =>
    [...trashQueryKeys.project(projectId), 'list'] as const,
}

export function getProjectTrash(projectId: number): Promise<TrashItemRead[]> {
  return apiGet<TrashItemRead[]>(`/projects/${projectId}/trash/`)
}

export function restoreTrashTransaction(
  projectId: number,
  transactionId: number,
): Promise<TransactionRead> {
  return apiPost<TransactionRead, undefined>(
    `/projects/${projectId}/trash/transactions/${transactionId}/restore`,
    undefined,
  )
}

export function restoreTrashDocument(
  projectId: number,
  documentId: number,
): Promise<DocumentRead> {
  return apiPost<DocumentRead, undefined>(
    `/projects/${projectId}/trash/documents/${documentId}/restore`,
    undefined,
  )
}

export function restoreTrashSupplier(
  projectId: number,
  supplierId: number,
): Promise<SupplierRead> {
  return apiPost<SupplierRead, undefined>(
    `/projects/${projectId}/trash/suppliers/${supplierId}/restore`,
    undefined,
  )
}

export function hardDeleteTrashTransaction(
  projectId: number,
  transactionId: number,
): Promise<void> {
  return apiDelete<void>(
    `/projects/${projectId}/trash/transactions/${transactionId}`,
  )
}

export function hardDeleteTrashDocument(
  projectId: number,
  documentId: number,
): Promise<void> {
  return apiDelete<void>(`/projects/${projectId}/trash/documents/${documentId}`)
}

export function hardDeleteTrashSupplier(
  projectId: number,
  supplierId: number,
): Promise<void> {
  return apiDelete<void>(`/projects/${projectId}/trash/suppliers/${supplierId}`)
}

export function emptyProjectTrash(projectId: number): Promise<void> {
  return apiDelete<void>(`/projects/${projectId}/trash/`)
}

export function useProjectTrashQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [...trashQueryKeys.all, 'missing-project', 'list']
        : trashQueryKeys.projectList(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectTrash(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useRestoreTrashTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      transactionId,
    }: {
      projectId: number
      transactionId: number
    }) => restoreTrashTransaction(projectId, transactionId),
  })
}

export function useRestoreTrashDocumentMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      documentId,
    }: {
      projectId: number
      documentId: number
    }) => restoreTrashDocument(projectId, documentId),
  })
}

export function useRestoreTrashSupplierMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      supplierId,
    }: {
      projectId: number
      supplierId: number
    }) => restoreTrashSupplier(projectId, supplierId),
  })
}

export function useHardDeleteTrashTransactionMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      transactionId,
    }: {
      projectId: number
      transactionId: number
    }) => hardDeleteTrashTransaction(projectId, transactionId),
  })
}

export function useHardDeleteTrashDocumentMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      documentId,
    }: {
      projectId: number
      documentId: number
    }) => hardDeleteTrashDocument(projectId, documentId),
  })
}

export function useHardDeleteTrashSupplierMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      supplierId,
    }: {
      projectId: number
      supplierId: number
    }) => hardDeleteTrashSupplier(projectId, supplierId),
  })
}

export function useEmptyProjectTrashMutation() {
  return useMutation({
    mutationFn: ({ projectId }: { projectId: number }) =>
      emptyProjectTrash(projectId),
  })
}
