import { useMutation, useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiDelete, apiGet, apiPost } from './client'
import type {
  DocumentDownloadUrl,
  DocumentListRead,
  DocumentRead,
} from './types'

export const documentQueryKeys = {
  all: ['documents'] as const,
  lists: () => [...documentQueryKeys.all, 'list'] as const,
  list: (includeDeleted = false) =>
    [...documentQueryKeys.lists(), { includeDeleted }] as const,
  byTransaction: (transactionId: number) =>
    [...documentQueryKeys.all, 'transaction', transactionId] as const,
  detail: (documentId: number) =>
    [...documentQueryKeys.all, documentId, 'detail'] as const,
  downloadUrl: (documentId: number) =>
    [...documentQueryKeys.all, documentId, 'download-url'] as const,
}

export function getDocuments(
  includeDeleted = false,
): Promise<DocumentListRead[]> {
  return apiGet<DocumentListRead[]>('/documents/', {
    params: { include_deleted: includeDeleted },
  })
}

export function getTransactionDocuments(
  transactionId: number,
): Promise<DocumentRead[]> {
  return apiGet<DocumentRead[]>(`/transactions/${transactionId}/documents`)
}

export function uploadTransactionDocument(
  transactionId: number,
  file: File,
): Promise<DocumentRead> {
  const formData = new FormData()
  formData.append('file', file)

  return apiPost<DocumentRead, FormData>(
    `/transactions/${transactionId}/documents`,
    formData,
  )
}

export function getDocument(documentId: number): Promise<DocumentRead> {
  return apiGet<DocumentRead>(`/documents/${documentId}`)
}

export function getDocumentDownloadUrl(
  documentId: number,
): Promise<DocumentDownloadUrl> {
  return apiGet<DocumentDownloadUrl>(`/documents/${documentId}/download-url`)
}

export function deleteDocument(documentId: number): Promise<void> {
  return apiDelete<void>(`/documents/${documentId}`)
}

export function useDocumentsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: documentQueryKeys.list(false),
    queryFn: () => getDocuments(false),
    enabled: options?.enabled ?? apiConfig.enableReadQueries,
  })
}

export function useTransactionDocumentsQuery(
  transactionId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      transactionId === null
        ? [...documentQueryKeys.all, 'missing-transaction']
        : documentQueryKeys.byTransaction(transactionId),
    queryFn: () => {
      if (transactionId === null) {
        throw new Error('Identifiant transaction manquant.')
      }

      return getTransactionDocuments(transactionId)
    },
    enabled:
      transactionId !== null &&
      (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useDocumentQuery(
  documentId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      documentId === null
        ? [...documentQueryKeys.all, 'missing-document', 'detail']
        : documentQueryKeys.detail(documentId),
    queryFn: () => {
      if (documentId === null) {
        throw new Error('Identifiant document manquant.')
      }

      return getDocument(documentId)
    },
    enabled:
      documentId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useDocumentDownloadUrlQuery(
  documentId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      documentId === null
        ? [...documentQueryKeys.all, 'missing-document', 'download-url']
        : documentQueryKeys.downloadUrl(documentId),
    queryFn: () => {
      if (documentId === null) {
        throw new Error('Identifiant document manquant.')
      }

      return getDocumentDownloadUrl(documentId)
    },
    enabled:
      documentId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useUploadTransactionDocumentMutation() {
  return useMutation({
    mutationFn: ({
      transactionId,
      file,
    }: {
      transactionId: number
      file: File
    }) => uploadTransactionDocument(transactionId, file),
  })
}

export function useDeleteDocumentMutation() {
  return useMutation({
    mutationFn: ({ documentId }: { documentId: number }) =>
      deleteDocument(documentId),
  })
}
