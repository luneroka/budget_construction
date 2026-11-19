import { buildPhoneNumber, splitPhoneNumber } from '@/lib/phone'
import type { Supplier } from '@/types'

// The supplier form's state and rules: Entreprise, Adresse and Contacts, one
// primary contact. Used by the supplier form page.

export type ContactDraft = {
  id: string
  name: string
  phone_country_code: string
  phone_number: string
  email: string
  is_primary: boolean
}

export type SupplierFormState = {
  id: string | null
  name: string
  siret: string
  rne_number: string
  comment: string
  street: string
  complement: string
  postal_code: string
  city: string
  contacts: ContactDraft[]
}

export function emptyContact(
  supplierId: string,
  isPrimary = false,
): ContactDraft {
  return {
    id: `${supplierId}-contact-${crypto.randomUUID()}`,
    name: '',
    phone_country_code: '+33',
    phone_number: '',
    email: '',
    is_primary: isPrimary,
  }
}

export function supplierToForm(supplier: Supplier | null): SupplierFormState {
  const supplierId = supplier?.id ?? `supplier-${crypto.randomUUID()}`

  if (supplier === null) {
    return {
      id: null,
      name: '',
      siret: '',
      rne_number: '',
      comment: '',
      street: '',
      complement: '',
      postal_code: '',
      city: '',
      contacts: [emptyContact(supplierId, true)],
    }
  }

  return {
    id: supplier.id,
    name: supplier.name,
    siret: supplier.siret ?? '',
    rne_number: supplier.rne_number ?? '',
    comment: supplier.comment ?? '',
    street: supplier.street ?? '',
    complement: supplier.complement ?? '',
    postal_code: supplier.postal_code ?? '',
    city: supplier.city ?? '',
    contacts: supplier.contacts.map<ContactDraft>((contact) => {
      const phone = splitPhoneNumber(contact.phone_number)

      return {
        id: contact.id,
        name: contact.name ?? '',
        phone_country_code: phone.countryCode,
        phone_number: phone.localNumber,
        email: contact.email ?? '',
        is_primary: contact.is_primary || supplier.contacts.length === 1,
      }
    }),
  }
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeBusinessIdentifier(value: string): string | null {
  const normalized = value.replace(/\s+/g, '')
  return normalized === '' ? null : normalized
}

/** The form's own checks, before anything is sent; null when it can be saved. */
export function validateSupplierForm(form: SupplierFormState): string | null {
  const primaryContacts = form.contacts.filter(
    (contact) => contact.is_primary || form.contacts.length === 1,
  )
  const hasEmptyContact = form.contacts.some(
    (contact) =>
      contact.name.trim() === '' &&
      contact.phone_number.trim() === '' &&
      contact.email.trim() === '',
  )

  if (form.name.trim() === '') return 'Le nom du fournisseur est obligatoire.'
  if (primaryContacts.length !== 1)
    return 'Un seul contact principal doit être sélectionné.'
  if (hasEmptyContact)
    return 'Chaque contact doit contenir au moins un champ renseigné.'
  return null
}

export function formToSupplier(
  form: SupplierFormState,
  supplier: Supplier | null,
): Supplier {
  const supplierId = form.id ?? `supplier-${crypto.randomUUID()}`
  const contacts = form.contacts.map((contact) => ({
    id: contact.id,
    supplier_id: supplierId,
    name: normalizeOptional(contact.name),
    phone_number: buildPhoneNumber(
      contact.phone_country_code,
      contact.phone_number,
    ),
    email: normalizeOptional(contact.email),
    is_primary: form.contacts.length === 1 ? true : contact.is_primary,
    created_at: null,
    updated_at: null,
  }))

  return {
    id: supplierId,
    user_id: supplier?.user_id ?? '0',
    name: form.name.trim(),
    siret: normalizeBusinessIdentifier(form.siret),
    rne_number: normalizeOptional(form.rne_number),
    comment: normalizeOptional(form.comment) ?? '',
    street: normalizeOptional(form.street),
    complement: normalizeOptional(form.complement),
    postal_code: normalizeOptional(form.postal_code),
    city: normalizeOptional(form.city),
    contacts,
    created_at: supplier?.created_at ?? null,
    updated_at: null,
    deleted_at: supplier?.deleted_at ?? null,
  }
}
