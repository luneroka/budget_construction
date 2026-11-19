import { useMutation, useQuery, type QueryClient } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import { documentQueryKeys } from './documents'
import { trashQueryKeys } from './trash'
import type {
  ApiDate,
  DocumentDownloadUrl,
  SupplierDocumentRead,
  SupplierDocumentType,
  SupplierDocumentUpdate,
} from './types'

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

export type SupplierDocumentUpload = {
  file: File
  type: SupplierDocumentType
  /** Omitted when null: the document has no expiry. */
  expiryDate: ApiDate | null
}

export function uploadSupplierDocument(
  supplierId: number,
  { file, type, expiryDate }: SupplierDocumentUpload,
): Promise<SupplierDocumentRead> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', type)
  if (expiryDate) {
    formData.append('expiry_date', expiryDate)
  }

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

// Type and expiry date only: the file stays as uploaded.
export function updateSupplierDocument(
  documentId: number,
  document: SupplierDocumentUpdate,
): Promise<SupplierDocumentRead> {
  return apiPatch<SupplierDocumentRead, SupplierDocumentUpdate>(
    `/supplier-documents/${documentId}`,
    document,
  )
}

export function deleteSupplierDocument(documentId: number): Promise<void> {
  return apiDelete<void>(`/supplier-documents/${documentId}`)
}

// After an add, an edit, a deletion or a restore: the supplier's own list,
// the Documents page and the trash. Suppliers are shared across projects, so
// a supplier document shows in every project's trash.
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
  void queryClient.invalidateQueries({
    queryKey: trashQueryKeys.all,
  })
  // The dashboard's supplier-documents widget, in every project.
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'projects' &&
      query.queryKey[2] === 'dashboard' &&
      query.queryKey[4] === 'supplier-documents',
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
    enabled: supplierId !== null && (options?.enabled ?? true),
  })
}

export function useUploadSupplierDocumentMutation() {
  return useMutation({
    mutationFn: ({
      supplierId,
      ...upload
    }: SupplierDocumentUpload & { supplierId: number }) =>
      uploadSupplierDocument(supplierId, upload),
  })
}

export function useUpdateSupplierDocumentMutation() {
  return useMutation({
    mutationFn: ({
      documentId,
      document,
    }: {
      documentId: number
      document: SupplierDocumentUpdate
    }) => updateSupplierDocument(documentId, document),
  })
}

export function useDeleteSupplierDocumentMutation() {
  return useMutation({
    mutationFn: ({ documentId }: { documentId: number }) =>
      deleteSupplierDocument(documentId),
  })
}
