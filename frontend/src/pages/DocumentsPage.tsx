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
import { documentsViewModel } from '@/demo/demo-data'

export function DocumentsPage() {
  const documents = documentsViewModel.documents

  return (
    <section>
      <PageHeader
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
            {documents.slice(0, 8).map((document) => (
              <TableRow key={document.id}>
                <TableCell className="font-medium">
                  {document.original_filename}
                </TableCell>
                <TableCell>{document.mime_type}</TableCell>
                <TableCell>
                  <StatusBadge status={document.state} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
