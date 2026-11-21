import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { useSupplierForm } from '@/hooks/useSupplierForm'

// The supplier form's sections: Entreprise, Adresse and Contacts. The
// supplier form page lays them out and adds the project's lots; the state
// and rules are in `useSupplierForm` and `lib/supplierForm`.

type SupplierFormControls = ReturnType<typeof useSupplierForm>

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="font-[family-name:var(--font-body)] text-xs font-semibold text-muted-foreground uppercase">
      {children}
    </h2>
  )
}

export function SupplierFormSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4">
      {action ? (
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>{title}</SectionTitle>
          {action}
        </div>
      ) : (
        <SectionTitle>{title}</SectionTitle>
      )}
      {children}
    </section>
  )
}

// Entreprise, Adresse and Contacts, with the same fields and limits as the
// former supplier modal.
export function SupplierFormSections({
  controls,
  disabled,
}: {
  controls: SupplierFormControls
  disabled: boolean
}) {
  const { form, setForm, updateContact, addContact, removeContact } = controls

  return (
    <>
      <SupplierFormSection title="Entreprise">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium" htmlFor="supplier-name">
              Fournisseur
            </label>
            <Input
              id="supplier-name"
              className="mt-1"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="supplier-siret">
              SIRET / SIREN
            </label>
            <Input
              id="supplier-siret"
              className="mt-1"
              value={form.siret}
              onChange={(event) =>
                setForm({ ...form, siret: event.target.value })
              }
            />
          </div>
          <div>
            {/* Free text, independent of the SIRET: nothing is derived
                or checked between the two. */}
            <label className="text-xs font-medium" htmlFor="supplier-rne">
              N° RNE
            </label>
            <Input
              id="supplier-rne"
              className="mt-1"
              maxLength={50}
              value={form.rne_number}
              onChange={(event) =>
                setForm({ ...form, rne_number: event.target.value })
              }
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium" htmlFor="supplier-comment">
            Commentaire
          </label>
          <Input
            id="supplier-comment"
            className="mt-1"
            value={form.comment}
            onChange={(event) =>
              setForm({ ...form, comment: event.target.value })
            }
          />
        </div>
      </SupplierFormSection>

      <SupplierFormSection title="Adresse">
        <div>
          <label className="text-xs font-medium" htmlFor="supplier-street">
            Rue
          </label>
          <Input
            id="supplier-street"
            className="mt-1"
            value={form.street}
            onChange={(event) =>
              setForm({ ...form, street: event.target.value })
            }
          />
        </div>
        <div>
          <label className="text-xs font-medium" htmlFor="supplier-complement">
            Complément d'adresse
          </label>
          <Input
            id="supplier-complement"
            className="mt-1"
            value={form.complement}
            onChange={(event) =>
              setForm({ ...form, complement: event.target.value })
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              className="text-xs font-medium"
              htmlFor="supplier-postal-code"
            >
              Code postal
            </label>
            <Input
              id="supplier-postal-code"
              className="mt-1"
              inputMode="numeric"
              maxLength={5}
              value={form.postal_code}
              onChange={(event) =>
                setForm({ ...form, postal_code: event.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="supplier-city">
              Ville
            </label>
            <Input
              id="supplier-city"
              className="mt-1"
              value={form.city}
              onChange={(event) =>
                setForm({ ...form, city: event.target.value })
              }
            />
          </div>
        </div>
      </SupplierFormSection>

      <SupplierFormSection
        title="Contacts"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={addContact}
          >
            <Plus aria-hidden />
            Ajouter un contact
          </Button>
        }
      >
        <div className="grid gap-2">
          {form.contacts.map((contact) => (
            <div
              key={contact.id}
              className="grid gap-2 py-1 lg:grid-cols-[minmax(12rem,1.1fr)_72px_minmax(10rem,0.9fr)_minmax(17rem,1.45fr)_92px_40px]"
            >
              <Input
                aria-label="Nom du contact"
                placeholder="Nom"
                value={contact.name}
                onChange={(event) =>
                  updateContact(contact.id, { name: event.target.value })
                }
              />
              <Input
                aria-label="Indicatif téléphonique"
                placeholder="+33"
                value={contact.phone_country_code}
                onChange={(event) =>
                  updateContact(contact.id, {
                    phone_country_code: event.target.value,
                  })
                }
              />
              <Input
                aria-label="Téléphone du contact"
                placeholder="7 90 90 90 90"
                value={contact.phone_number}
                onChange={(event) =>
                  updateContact(contact.id, {
                    phone_number: event.target.value,
                  })
                }
              />
              <Input
                aria-label="Email du contact"
                placeholder="Email"
                value={contact.email}
                onChange={(event) =>
                  updateContact(contact.id, { email: event.target.value })
                }
              />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={contact.is_primary || form.contacts.length === 1}
                  disabled={
                    disabled || contact.is_primary || form.contacts.length === 1
                  }
                  onChange={(event) =>
                    updateContact(contact.id, {
                      is_primary: event.target.checked,
                    })
                  }
                />
                Principal
              </label>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Supprimer le contact"
                disabled={disabled || form.contacts.length === 1}
                onClick={() => removeContact(contact.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </SupplierFormSection>
    </>
  )
}
