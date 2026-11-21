import { describe, expect, it } from 'vitest'

import type { Supplier, SupplierContact } from '@/types'

import { emailRecipients, writeAction } from './supplierEmail'

const contact = (overrides: Partial<SupplierContact>): SupplierContact => ({
  id: '1',
  supplier_id: '12',
  name: null,
  phone_number: null,
  email: null,
  is_primary: false,
  created_at: null,
  updated_at: null,
  ...overrides,
})

const supplier = (contacts: SupplierContact[]): Supplier => ({
  id: '12',
  user_id: '1',
  name: 'Menuiserie Dupont',
  siret: null,
  rne_number: null,
  comment: '',
  street: null,
  complement: null,
  postal_code: null,
  city: null,
  contacts,
  created_at: null,
  updated_at: null,
  deleted_at: null,
})

describe('writeAction', () => {
  it('is hidden when no contact has an email', () => {
    const recipients = emailRecipients(
      supplier([
        contact({ id: '1', name: 'Paul', phone_number: '+33612345678' }),
        contact({ id: '2', email: '   ' }),
      ]),
    )

    expect(recipients).toEqual([])
    expect(writeAction(recipients)).toEqual({ kind: 'hidden' })
  })

  it('opens mailto directly with exactly one email, with no menu', () => {
    const recipients = emailRecipients(
      supplier([
        contact({ id: '1', name: 'Paul' }),
        contact({ id: '2', name: 'Anne', email: 'anne@dupont.fr' }),
      ]),
    )

    expect(writeAction(recipients)).toEqual({
      kind: 'direct',
      href: 'mailto:anne%40dupont.fr',
    })
  })

  it('lists every contact with an email as « name — email », primary first', () => {
    const recipients = emailRecipients(
      supplier([
        contact({ id: '1', name: 'Paul', email: 'paul@dupont.fr' }),
        contact({
          id: '2',
          name: 'Anne',
          email: ' anne@dupont.fr ',
          is_primary: true,
        }),
        contact({ id: '3', email: 'compta@dupont.fr' }),
      ]),
    )

    expect(writeAction(recipients)).toEqual({
      kind: 'menu',
      recipients: [
        {
          contactId: '2',
          label: 'Anne — anne@dupont.fr',
          email: 'anne@dupont.fr',
        },
        {
          contactId: '1',
          label: 'Paul — paul@dupont.fr',
          email: 'paul@dupont.fr',
        },
        {
          contactId: '3',
          label: 'compta@dupont.fr',
          email: 'compta@dupont.fr',
        },
      ],
    })
  })
})
