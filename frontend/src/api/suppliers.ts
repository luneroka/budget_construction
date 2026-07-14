import { useMutation, useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { SupplierCreate, SupplierRead, SupplierUpdate } from './types'
import { normalizePhoneNumber } from '@/lib/phone'

type SupplierPayloadContactSource = {
  id: string
  name: string | null
  phone_number: string | null
  email: string | null
  is_primary: boolean
}

type SupplierPayloadSource = {
  name: string
  siret: string | null
  comment: string | null
  street: string | null
  complement: string | null
  postal_code: string | null
  city: string | null
  contacts: SupplierPayloadContactSource[]
}

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

function nullableText(value: string | null): string | null {
  const normalized = value?.trim() ?? ''
  return normalized === '' ? null : normalized
}

function nullableBusinessIdentifier(value: string | null): string | null {
  const normalized = value?.replace(/\s+/g, '') ?? ''
  return normalized === '' ? null : normalized
}

function contactsToCreatePayload(
  supplier: SupplierPayloadSource,
): SupplierCreate['contacts'] {
  return supplier.contacts.map((contact) => ({
    name: nullableText(contact.name),
    phone_number: normalizePhoneNumber(contact.phone_number),
    email: nullableText(contact.email),
    is_primary: supplier.contacts.length === 1 ? true : contact.is_primary,
  }))
}

function contactsToUpdatePayload(
  supplier: SupplierPayloadSource,
): NonNullable<SupplierUpdate['contacts']> {
  return supplier.contacts.map((contact) => {
    const contactId = Number(contact.id)

    return {
      id: Number.isInteger(contactId) ? contactId : null,
      name: nullableText(contact.name),
      phone_number: normalizePhoneNumber(contact.phone_number),
      email: nullableText(contact.email),
      is_primary: supplier.contacts.length === 1 ? true : contact.is_primary,
    }
  })
}

export function supplierToCreatePayload(
  supplier: SupplierPayloadSource,
): SupplierCreate {
  return {
    name: supplier.name,
    siret: nullableBusinessIdentifier(supplier.siret),
    comment: nullableText(supplier.comment),
    street: nullableText(supplier.street),
    complement: nullableText(supplier.complement),
    postal_code: nullableText(supplier.postal_code),
    city: nullableText(supplier.city),
    contacts: contactsToCreatePayload(supplier),
  }
}

export function quickSupplierToCreatePayload(name: string): SupplierCreate {
  const normalizedName = name.trim()

  return {
    name: normalizedName,
    siret: null,
    comment: null,
    street: null,
    complement: null,
    postal_code: null,
    city: null,
    contacts: [
      {
        name: normalizedName,
        is_primary: true,
      },
    ],
  }
}

export function supplierToUpdatePayload(
  supplier: SupplierPayloadSource,
): SupplierUpdate {
  return {
    name: supplier.name,
    siret: nullableBusinessIdentifier(supplier.siret),
    comment: nullableText(supplier.comment),
    street: nullableText(supplier.street),
    complement: nullableText(supplier.complement),
    postal_code: nullableText(supplier.postal_code),
    city: nullableText(supplier.city),
    contacts: contactsToUpdatePayload(supplier),
  }
}

export function sortSuppliers(suppliers: SupplierRead[]): SupplierRead[] {
  return [...suppliers].sort((first, second) =>
    first.name.localeCompare(second.name, 'fr', { sensitivity: 'base' }),
  )
}

export function upsertSupplier(
  currentSuppliers: SupplierRead[] | undefined,
  supplier: SupplierRead,
): SupplierRead[] {
  const current = currentSuppliers ?? []
  const hasSupplier = current.some((candidate) => candidate.id === supplier.id)
  const next = hasSupplier
    ? current.map((candidate) =>
        candidate.id === supplier.id ? supplier : candidate,
      )
    : [...current, supplier]

  return sortSuppliers(next)
}
