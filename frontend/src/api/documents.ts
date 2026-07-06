import { useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiGet } from './client'
import type { DocumentDownloadUrl, DocumentRead } from './types'

export const documentQueryKeys = {
  all: ['documents'] as const,
  byTransaction: (transactionId: number) =>
    [...documentQueryKeys.all, 'transaction', transactionId] as const,
  downloadUrl: (documentId: number) =>
    [...documentQueryKeys.all, documentId, 'download-url'] as const,
}

export function getTransactionDocuments(
  transactionId: number,
): Promise<DocumentRead[]> {
  return apiGet<DocumentRead[]>(`/transactions/${transactionId}/documents`)
}

export function getDocumentDownloadUrl(
  documentId: number,
): Promise<DocumentDownloadUrl> {
  return apiGet<DocumentDownloadUrl>(`/documents/${documentId}/download-url`)
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
        throw new Error('Transaction id is required')
      }

      return getTransactionDocuments(transactionId)
    },
    enabled:
      transactionId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
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
        throw new Error('Document id is required')
      }

      return getDocumentDownloadUrl(documentId)
    },
    enabled:
      documentId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}
