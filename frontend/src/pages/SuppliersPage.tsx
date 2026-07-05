import { Plus } from 'lucide-react'

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

export function SuppliersPage() {
  return (
    <section>
      <PageHeader
        eyebrow="Annuaire"
        title="Fournisseurs"
        description="Gestion des fournisseurs selon les champs backend: nom, contact, telephone, email, SIRET et commentaire."
        actions={
          <Button variant="gold">
            <Plus aria-hidden />
            Nouveau
          </Button>
        }
      />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar searchPlaceholder="Rechercher un fournisseur" />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Rhone Terrassement</TableCell>
              <TableCell>Jean Martin</TableCell>
              <TableCell>contact@example.test</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
