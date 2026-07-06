import { useMemo, useState } from 'react'
import { Building2, IdCard, Mail, Plus } from 'lucide-react'

import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableToolbar } from '@/components/shared/TableToolbar'
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
import { formatDate } from '@/lib/format'

export function SuppliersPage() {
  const [search, setSearch] = useState('')
  const suppliers = supplierTableViewModel.suppliers
  const normalizedSearch = search.trim().toLowerCase()
  const suppliersWithEmail = suppliers.filter((supplier) => supplier.email).length
  const suppliersWithSiret = suppliers.filter((supplier) => supplier.siret).length
  const filteredSuppliers = useMemo(() => {
    if (!normalizedSearch) return suppliers

    return suppliers.filter((supplier) =>
      [
        supplier.name,
        supplier.contact_name,
        supplier.phone_number,
        supplier.email,
        supplier.siret,
        supplier.comment,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    )
  }, [normalizedSearch, suppliers])

  return (
    <section>
      <PageHeader
        title="Fournisseurs"
        description="Répertoire des fournisseurs du projet, aligné sur les champs backend fournisseur."
        actions={
          <Button variant="gold">
            <Plus aria-hidden />
            Nouveau fournisseur
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Fournisseurs"
          value={String(suppliers.length)}
          detail="Enregistrements actifs de la seed"
          icon={Building2}
          tone="primary"
        />
        <KpiCard
          label="Emails renseignés"
          value={String(suppliersWithEmail)}
          detail={`${suppliers.length - suppliersWithEmail} sans email`}
          icon={Mail}
          tone="accent"
        />
        <KpiCard
          label="SIRET renseignés"
          value={String(suppliersWithSiret)}
          detail="Champ nullable côté backend"
          icon={IdCard}
          tone="gold"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher nom, contact, email, SIRET..."
          onSearchChange={setSearch}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>SIRET</TableHead>
              <TableHead>Commentaire</TableHead>
              <TableHead>Créé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className="font-medium">{supplier.name}</TableCell>
                <TableCell>{supplier.contact_name ?? '-'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {supplier.phone_number ?? '-'}
                </TableCell>
                <TableCell>{supplier.email ?? '-'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {supplier.siret ?? '-'}
                </TableCell>
                <TableCell className="max-w-xs text-muted-foreground">
                  {supplier.comment ?? '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(supplier.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredSuppliers.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Aucun fournisseur ne correspond à la recherche.
          </div>
        ) : null}
      </div>
    </section>
  )
}
