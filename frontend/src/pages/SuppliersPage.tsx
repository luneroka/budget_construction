import { useMemo, useState } from 'react'
import { Eye, Plus } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { TableToolbar } from '@/components/shared/TableToolbar'
import {
  SupplierModal,
  type SupplierModalMode,
} from '@/components/suppliers/SupplierModal'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supplierTableViewModel } from '@/demo/demo-data'
import type { SupplierContactViewModel, SupplierRowViewModel } from '@/demo/types'

function primaryContact(
  supplier: SupplierRowViewModel,
): SupplierContactViewModel | undefined {
  return (
    supplier.contacts.find((contact) => contact.is_primary) ?? supplier.contacts[0]
  )
}

export function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [suppliers, setSuppliers] = useState(supplierTableViewModel.suppliers)
  const [modalMode, setModalMode] = useState<SupplierModalMode | null>(null)
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierRowViewModel | null>(null)
  const normalizedSearch = search.trim().toLowerCase()
  const filteredSuppliers = useMemo(() => {
    if (!normalizedSearch) return suppliers

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.siret,
        supplier.comment,
        ...supplier.contacts.flatMap((contact) => [
          contact.name,
          contact.phone_number,
          contact.email,
        ]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    )
  }, [normalizedSearch, suppliers])

  function openCreateModal() {
    setSelectedSupplier(null)
    setModalMode('create')
  }

  function openDetailModal(supplier: SupplierRowViewModel) {
    setSelectedSupplier(supplier)
    setModalMode('view')
  }

  function closeModal() {
    setModalMode(null)
    setSelectedSupplier(null)
  }

  function saveSupplier(savedSupplier: SupplierRowViewModel) {
    setSuppliers((current) => {
      if (current.every((supplier) => supplier.id !== savedSupplier.id)) {
        return [...current, savedSupplier]
      }

      return current.map((supplier) =>
        supplier.id === savedSupplier.id ? savedSupplier : supplier,
      )
    })
  }

  return (
    <section>
      <PageHeader
        title="Fournisseurs"
        description="Répertoire des entreprises fournisseurs et de leurs contacts."
        actions={
          <Button variant="gold" onClick={openCreateModal}>
            <Plus aria-hidden />
            Nouveau fournisseur
          </Button>
        }
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher fournisseur, contact, email..."
          onSearchChange={setSearch}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Contact principal</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.map((supplier) => {
              const contact = primaryContact(supplier)

              return (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center justify-between gap-3">
                      <span>{supplier.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Voir ${supplier.name}`}
                        onClick={() => openDetailModal(supplier)}
                      >
                        <Eye aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{contact?.name ?? '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {contact?.phone_number ?? '-'}
                  </TableCell>
                  <TableCell>{contact?.email ?? '-'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {filteredSuppliers.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Aucun fournisseur ne correspond à la recherche.
          </div>
        ) : null}
      </div>

      {modalMode !== null ? (
        <SupplierModal
          mode={modalMode}
          supplier={selectedSupplier}
          fallbackUserId={supplierTableViewModel.suppliers[0]?.user_id ?? 'demo-user'}
          onClose={closeModal}
          onSave={saveSupplier}
        />
      ) : null}
    </section>
  )
}
