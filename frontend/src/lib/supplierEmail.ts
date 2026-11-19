import type { Supplier } from '@/types'

export type EmailRecipient = {
  contactId: string
  /** « name — email », or the address alone for a contact without a name. */
  label: string
  email: string
}

export function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email)}`
}

// The supplier's contacts that have an address, the primary contact first.
export function emailRecipients(supplier: Supplier): EmailRecipient[] {
  return supplier.contacts
    .map((contact) => ({ contact, email: (contact.email ?? '').trim() }))
    .filter(({ email }) => email !== '')
    .sort(
      (left, right) =>
        Number(right.contact.is_primary) - Number(left.contact.is_primary),
    )
    .map(({ contact, email }) => {
      const name = (contact.name ?? '').trim()
      return {
        contactId: contact.id,
        label: name ? `${name} — ${email}` : email,
        email,
      }
    })
}

export type WriteAction =
  | { kind: 'hidden' }
  | { kind: 'direct'; href: string }
  | { kind: 'menu'; recipients: EmailRecipient[] }

// « Écrire »: hidden without an address, straight to the mail client with
// one, a menu of the contacts with several.
export function writeAction(recipients: EmailRecipient[]): WriteAction {
  if (recipients.length === 0) return { kind: 'hidden' }
  if (recipients.length === 1)
    return { kind: 'direct', href: mailtoHref(recipients[0].email) }
  return { kind: 'menu', recipients }
}
