import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiDelete, apiGet, apiPost } from './client'
import { documentQueryKeys } from './documents'
import type { DocumentDownloadUrl, SupplierDocumentRead } from './types'

export const supplierDocumentQueryKeys = {
  all: ['supplier-documents'] as const,
  bySupplier: (supplierId: number) =>
    [...supplierDocumentQueryKeys.all, 'supplier', supplierId] as const,
}

export function getSupplierDocuments(
  supplierId: number,
): Promise<SupplierDocumentRead[]> {
  return apiGet<SupplierDocumentRead[]>(`/suppliers/${supplierId}/documents`)
}

export function uploadSupplierDocument(
  supplierId: number,
  file: File,
): Promise<SupplierDocumentRead> {
  const formData = new FormData()
  formData.append('file', file)

  return apiPost<SupplierDocumentRead, FormData>(
    `/suppliers/${supplierId}/documents`,
    formData,
  )
}

export function getSupplierDocumentDownloadUrl(
  documentId: number,
  inline = true,
): Promise<DocumentDownloadUrl> {
  return apiGet<DocumentDownloadUrl>(
    `/supplier-documents/${documentId}/download-url`,
    {
      params: { inline },
    },
  )
}

export function deleteSupplierDocument(documentId: number): Promise<void> {
  return apiDelete<void>(`/supplier-documents/${documentId}`)
}

export function invalidateSupplierDocumentQueries(
  queryClient: QueryClient,
  supplierId: number,
) {
  void queryClient.invalidateQueries({
    queryKey: documentQueryKeys.lists(),
  })
  void queryClient.invalidateQueries({
    queryKey: supplierDocumentQueryKeys.bySupplier(supplierId),
  })
}

export function useSupplierDocumentsQuery(
  supplierId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      supplierId === null
        ? [...supplierDocumentQueryKeys.all, 'missing-supplier']
        : supplierDocumentQueryKeys.bySupplier(supplierId),
    queryFn: () => {
      if (supplierId === null) {
        throw new Error('Identifiant fournisseur manquant.')
      }

      return getSupplierDocuments(supplierId)
    },
    enabled:
      supplierId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useUploadSupplierDocumentMutation() {
  return useMutation({
    mutationFn: ({
      supplierId,
      file,
    }: {
      supplierId: number
      file: File
    }) => uploadSupplierDocument(supplierId, file),
  })
}

export function useDeleteSupplierDocumentMutation() {
  return useMutation({
    mutationFn: ({ documentId }: { documentId: number }) =>
      deleteSupplierDocument(documentId),
  })
}
