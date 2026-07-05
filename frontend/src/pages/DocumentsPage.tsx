import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function DocumentsPage() {
  return (
    <section>
      <PageHeader
        eyebrow="Justificatifs"
        title="Documents"
        description="Recherche et suivi des fichiers rattaches aux transactions du projet."
      />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fichier</TableHead>
              <TableHead>Type MIME</TableHead>
              <TableHead>Etat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">devis-terrassement.pdf</TableCell>
              <TableCell>application/pdf</TableCell>
              <TableCell>
                <StatusBadge status="attached" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
