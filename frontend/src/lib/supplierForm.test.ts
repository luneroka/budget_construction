import { describe, expect, it } from 'vitest'

import {
  type SupplierFormState,
  emptyContact,
  formToSupplier,
  supplierToForm,
  validateSupplierForm,
} from './supplierForm'

const form = (
  overrides: Partial<SupplierFormState> = {},
): SupplierFormState => ({
  ...supplierToForm(null),
  name: 'Maçon Durand',
  contacts: [{ ...emptyContact('s', true), name: 'Paul' }],
  ...overrides,
})

describe('validateSupplierForm', () => {
  it('accepts a named supplier with one primary contact', () => {
    expect(validateSupplierForm(form())).toBeNull()
  })

  it('needs a name', () => {
    expect(validateSupplierForm(form({ name: '  ' }))).toBe(
      'Le nom du fournisseur est obligatoire.',
    )
  })

  it('needs exactly one primary contact among several', () => {
    const contacts = [
      { ...emptyContact('s'), name: 'Paul' },
      { ...emptyContact('s'), name: 'Anne' },
    ]
    expect(validateSupplierForm(form({ contacts }))).toBe(
      'Un seul contact principal doit être sélectionné.',
    )
  })

  it('refuses an empty contact', () => {
    const contacts = [
      { ...emptyContact('s', true), name: 'Paul' },
      emptyContact('s'),
    ]
    expect(validateSupplierForm(form({ contacts }))).toBe(
      'Chaque contact doit contenir au moins un champ renseigné.',
    )
  })
})

describe('formToSupplier', () => {
  it('trims and empties the optional fields, and squeezes the SIRET', () => {
    const supplier = formToSupplier(
      form({ name: ' Maçon ', siret: '123 456 789', city: ' ', comment: '' }),
      null,
    )
    expect(supplier.name).toBe('Maçon')
    expect(supplier.siret).toBe('123456789')
    expect(supplier.city).toBeNull()
    expect(supplier.comment).toBe('')
  })

  it('makes a single contact the primary one', () => {
    const supplier = formToSupplier(
      form({ contacts: [{ ...emptyContact('s'), name: 'Paul' }] }),
      null,
    )
    expect(supplier.contacts[0].is_primary).toBe(true)
  })
})
