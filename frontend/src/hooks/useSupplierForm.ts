import { useState } from 'react'

import {
  type ContactDraft,
  type SupplierFormState,
  emptyContact,
  supplierToForm,
} from '@/lib/supplierForm'
import type { Supplier } from '@/types'

/** The form's state, what it held when it opened, and its contact edits. */
export function useSupplierForm(supplier: Supplier | null) {
  // Kept rather than rebuilt for the comparison: a new supplier's form
  // draws random ids.
  const [initialForm] = useState<SupplierFormState>(() =>
    supplierToForm(supplier),
  )
  const [form, setForm] = useState<SupplierFormState>(initialForm)
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(initialForm)

  function updateContact(contactId: string, updates: Partial<ContactDraft>) {
    setForm((current) => {
      if (updates.is_primary === false) return current

      const contacts = current.contacts.map((contact) =>
        contact.id === contactId ? { ...contact, ...updates } : contact,
      )

      return {
        ...current,
        contacts: updates.is_primary
          ? contacts.map((contact) => ({
              ...contact,
              is_primary: contact.id === contactId,
            }))
          : contacts,
      }
    })
  }

  function addContact() {
    setForm((current) => ({
      ...current,
      contacts: [...current.contacts, emptyContact(current.id ?? 'supplier')],
    }))
  }

  function removeContact(contactId: string) {
    setForm((current) => {
      if (current.contacts.length === 1) return current

      const removedContact = current.contacts.find(
        (contact) => contact.id === contactId,
      )
      const remainingContacts = current.contacts.filter(
        (contact) => contact.id !== contactId,
      )

      if (removedContact?.is_primary && remainingContacts.length > 0) {
        remainingContacts[0] = { ...remainingContacts[0], is_primary: true }
      }

      return { ...current, contacts: remainingContacts }
    })
  }

  return {
    form,
    setForm,
    hasUnsavedChanges,
    updateContact,
    addContact,
    removeContact,
  }
}
