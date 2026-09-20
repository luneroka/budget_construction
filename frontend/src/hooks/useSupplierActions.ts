import { useQueryClient } from '@tanstack/react-query'

import { getApiErrorMessage } from '@/api/client'
import { trashQueryKeys } from '@/api/trash'
import {
  supplierQueryKeys,
  useDeleteSupplierMutation,
  supplierToCreatePayload,
  supplierToUpdatePayload,
  upsertSupplier,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
} from '@/api/suppliers'
import type { SupplierRead } from '@/api/types'
import { supplierToDomain } from '@/lib/apiAdapters'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type { Supplier } from '@/types'

// Saving and deleting a supplier, from the list or from its own page: create
// when there is no id yet, update otherwise, then refresh the list, that
// supplier's own entry, and the trash a deletion feeds.
export function useSupplierActions(projectId: number | null = null) {
  const queryClient = useQueryClient()
  const createSupplierMutation = useCreateSupplierMutation()
  const updateSupplierMutation = useUpdateSupplierMutation()
  const deleteSupplierMutation = useDeleteSupplierMutation()

  async function saveSupplier(
    supplier: Supplier,
    existingSupplierId: string | null,
  ): Promise<Supplier> {
    try {
      const isCreating = existingSupplierId === null
      const saved = isCreating
        ? await createSupplierMutation.mutateAsync(
            supplierToCreatePayload(supplier),
          )
        : await updateSupplierMutation.mutateAsync({
            supplierId: Number(existingSupplierId),
            supplier: supplierToUpdatePayload(supplier),
          })

      queryClient.setQueryData<SupplierRead[]>(
        supplierQueryKeys.list(false),
        (current) => upsertSupplier(current, saved),
      )
      queryClient.setQueryData(supplierQueryKeys.detail(saved.id), saved)
      void queryClient.invalidateQueries({
        queryKey: supplierQueryKeys.list(false),
      })
      notifySuccess(isCreating ? 'Fournisseur ajouté.' : 'Fournisseur modifié.')
      return supplierToDomain(saved)
    } catch (error) {
      const message = getApiErrorMessage(error)
      notifyError(`Impossible d’enregistrer le fournisseur. ${message}`)
      throw new Error(message)
    }
  }

  async function deleteSupplier(supplier: Supplier) {
    const supplierId = Number(supplier.id)
    await deleteSupplierMutation.mutateAsync(supplierId)
    queryClient.setQueryData<SupplierRead[]>(
      supplierQueryKeys.list(false),
      (current) =>
        current?.filter((candidate) => candidate.id !== supplierId) ?? [],
    )
    void queryClient.invalidateQueries({
      queryKey: supplierQueryKeys.list(false),
    })
    if (projectId !== null) {
      void queryClient.invalidateQueries({
        queryKey: trashQueryKeys.projectList(projectId),
      })
    }
    notifySuccess('Fournisseur déplacé dans la corbeille.')
  }

  return {
    saveSupplier,
    deleteSupplier,
    isDeleting: deleteSupplierMutation.isPending,
  }
}
