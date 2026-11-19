import { useQueryClient } from '@tanstack/react-query'

import { invalidateProjectFinancialQueries } from '@/api/budget-workspace-cache'
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
import type { SupplierProjectLots, SupplierRead } from '@/api/types'
import { supplierToDomain } from '@/lib/apiAdapters'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type { Supplier } from '@/types'

// Saving and deleting a supplier, from the supplier form page: create when
// there is no id yet, update otherwise, with the project's lots in the same
// request, then refresh the list, that supplier's own entry, the project's
// lots and figures, and the trash a deletion feeds.
export function useSupplierActions(projectId: number | null = null) {
  const queryClient = useQueryClient()
  const createSupplierMutation = useCreateSupplierMutation()
  const updateSupplierMutation = useUpdateSupplierMutation()
  const deleteSupplierMutation = useDeleteSupplierMutation()

  async function saveSupplier(
    supplier: Supplier,
    existingSupplierId: string | null,
    projectLots?: SupplierProjectLots,
  ): Promise<Supplier> {
    try {
      const isCreating = existingSupplierId === null
      const saved = isCreating
        ? await createSupplierMutation.mutateAsync({
            ...supplierToCreatePayload(supplier),
            project_lots: projectLots ?? null,
          })
        : await updateSupplierMutation.mutateAsync({
            supplierId: Number(existingSupplierId),
            supplier: {
              ...supplierToUpdatePayload(supplier),
              project_lots: projectLots ?? null,
            },
          })

      queryClient.setQueryData<SupplierRead[]>(
        supplierQueryKeys.list(false),
        (current) => upsertSupplier(current, saved),
      )
      queryClient.setQueryData(supplierQueryKeys.detail(saved.id), saved)
      void queryClient.invalidateQueries({
        queryKey: supplierQueryKeys.list(false),
      })
      if (projectLots) {
        invalidateProjectFinancialQueries(queryClient, projectLots.project_id)
      }
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
