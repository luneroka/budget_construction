import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { getApiErrorMessage } from '@/api/client'
import {
  quickSupplierToCreatePayload,
  supplierQueryKeys,
  useCreateSupplierMutation,
  upsertSupplier,
} from '@/api/suppliers'
import type { SupplierRead } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type { Supplier } from '@/types'

import { Field } from './TransactionFormFields'

const QUICK_ADD_SUPPLIER_VALUE = '__quick_add_supplier__'

export function SupplierSelectField({
  id,
  value,
  suppliers,
  disabled,
  className,
  onChange,
}: {
  id: string
  value: string
  suppliers: Supplier[]
  disabled?: boolean
  className?: string
  onChange: (supplierId: string) => void
}) {
  const queryClient = useQueryClient()
  const createSupplierMutation = useCreateSupplierMutation()
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false)
  const [quickSupplierName, setQuickSupplierName] = useState('')
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null)
  const isCreatingSupplier = createSupplierMutation.isPending

  function handleSelectChange(supplierId: string) {
    if (supplierId === QUICK_ADD_SUPPLIER_VALUE) {
      setIsQuickCreateOpen(true)
      setQuickCreateError(null)
      return
    }

    onChange(supplierId)
    setIsQuickCreateOpen(false)
    setQuickCreateError(null)
  }

  function closeQuickCreate() {
    if (isCreatingSupplier) return
    setIsQuickCreateOpen(false)
    setQuickSupplierName('')
    setQuickCreateError(null)
  }

  async function createQuickSupplier() {
    const supplierName = quickSupplierName.trim()

    if (supplierName === '') {
      setQuickCreateError('Le nom du fournisseur est obligatoire.')
      return
    }

    try {
      setQuickCreateError(null)
      const supplier = await createSupplierMutation.mutateAsync(
        quickSupplierToCreatePayload(supplierName),
      )
      queryClient.setQueryData<SupplierRead[]>(
        supplierQueryKeys.list(false),
        (current) => upsertSupplier(current, supplier),
      )
      void queryClient.invalidateQueries({
        queryKey: supplierQueryKeys.list(false),
      })
      onChange(String(supplier.id))
      setIsQuickCreateOpen(false)
      setQuickSupplierName('')
      notifySuccess('Fournisseur ajouté.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setQuickCreateError(message)
      notifyError(`Impossible d’ajouter le fournisseur. ${message}`)
    }
  }

  return (
    <div className="space-y-2">
      <Select
        id={id}
        className={className}
        value={value}
        disabled={disabled || isCreatingSupplier}
        onChange={(event) => handleSelectChange(event.target.value)}
      >
        <option value="">Aucun fournisseur</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
        <option value={QUICK_ADD_SUPPLIER_VALUE}>
          ➕ Ajouter un fournisseur…
        </option>
      </Select>

      {isQuickCreateOpen ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Ajouter un fournisseur"
          className="space-y-3 rounded-md border border-border bg-background p-3"
        >
          <Field label="Nom du fournisseur" htmlFor={`${id}-quick-name`}>
            <Input
              id={`${id}-quick-name`}
              className={className}
              value={quickSupplierName}
              disabled={isCreatingSupplier}
              autoFocus
              onChange={(event) => {
                setQuickSupplierName(event.target.value)
                setQuickCreateError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void createQuickSupplier()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeQuickCreate()
                }
              }}
            />
          </Field>
          {quickCreateError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {quickCreateError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={isCreatingSupplier}
              onClick={closeQuickCreate}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              type="button"
              disabled={isCreatingSupplier}
              onClick={() => void createQuickSupplier()}
            >
              {isCreatingSupplier ? 'Ajout...' : 'Ajouter'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
