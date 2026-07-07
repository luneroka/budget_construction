import { useMutation, useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { SupplierCreate, SupplierRead, SupplierUpdate } from './types'

export const supplierQueryKeys = {
  all: ['suppliers'] as const,
  lists: () => [...supplierQueryKeys.all, 'list'] as const,
  list: (includeDeleted = false) =>
    [...supplierQueryKeys.lists(), { includeDeleted }] as const,
}

export function getSuppliers(includeDeleted = false): Promise<SupplierRead[]> {
  return apiGet<SupplierRead[]>('/suppliers/', {
    params: { include_deleted: includeDeleted },
  })
}

export function createSupplier(
  supplier: SupplierCreate,
): Promise<SupplierRead> {
  return apiPost<SupplierRead, SupplierCreate>('/suppliers/', supplier)
}

export function updateSupplier(
  supplierId: number,
  supplier: SupplierUpdate,
): Promise<SupplierRead> {
  return apiPatch<SupplierRead, SupplierUpdate>(
    `/suppliers/${supplierId}`,
    supplier,
  )
}

export function deleteSupplier(supplierId: number): Promise<SupplierRead> {
  return apiDelete<SupplierRead>(`/suppliers/${supplierId}`)
}

export function useSuppliersQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: supplierQueryKeys.list(false),
    queryFn: () => getSuppliers(false),
    enabled: options?.enabled ?? apiConfig.enableReadQueries,
  })
}

export function useCreateSupplierMutation() {
  return useMutation({
    mutationFn: createSupplier,
  })
}

export function useUpdateSupplierMutation() {
  return useMutation({
    mutationFn: ({
      supplierId,
      supplier,
    }: {
      supplierId: number
      supplier: SupplierUpdate
    }) => updateSupplier(supplierId, supplier),
  })
}

export function useDeleteSupplierMutation() {
  return useMutation({
    mutationFn: deleteSupplier,
  })
}
