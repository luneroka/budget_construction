import { normalizePhoneNumber } from '@/lib/phone'
import { notifyError, notifySuccess } from '@/lib/toasts'
import type { Supplier, SupplierContact } from '@/types'

// The contact to reach first: the one marked as such, else the first one.
export function primaryContact(
  supplier: Supplier,
): SupplierContact | undefined {
  return (
    supplier.contacts.find((contact) => contact.is_primary) ??
    supplier.contacts[0]
  )
}

export async function copyEmailToClipboard(email: string) {
  try {
    await navigator.clipboard.writeText(email)
    notifySuccess('Email copié dans le presse-papiers.')
  } catch {
    notifyError('Impossible de copier l’email.')
  }
}

export function phoneHref(phoneNumber: string) {
  try {
    return `tel:${normalizePhoneNumber(phoneNumber) ?? ''}`
  } catch {
    return `tel:${phoneNumber.replace(/[^\d+]/g, '')}`
  }
}

export function supplierAddressLines(supplier: Supplier) {
  return [
    supplier.street,
    supplier.complement,
    [supplier.postal_code, supplier.city].filter(Boolean).join(' ').trim(),
  ].filter((line) => (line ?? '').trim() !== '') as string[]
}
