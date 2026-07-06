import { useMemo, useState } from 'react'
import { Database, FileText, HardDrive, Upload } from 'lucide-react'

import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
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
import { documentsViewModel } from '@/demo/demo-data'
import { formatDate, formatFileSize } from '@/lib/format'

export function DocumentsPage() {
  const [search, setSearch] = useState('')
  const documents = documentsViewModel.documents
  const normalizedSearch = search.trim().toLowerCase()
  const filteredDocuments = useMemo(() => {
    if (!normalizedSearch) return documents

    return documents.filter((document) =>
      [
        document.original_filename,
        document.stored_filename,
        document.file_path,
        document.mime_type,
        document.transaction_id,
        document.transaction_description,
        document.state,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    )
  }, [documents, normalizedSearch])
  const totalFileSize = documents.reduce(
    (total, document) => total + document.file_size,
    0,
  )
  const attachedDocuments = documents.filter(
    (document) => document.state === 'attached',
  ).length
  const derivedStates = new Set(documents.map((document) => document.state)).size

  return (
    <section>
      <PageHeader
        title="Documents"
        description="Fichiers rattachés aux transactions, avec métadonnées backend et état d'affichage dérivé."
        actions={
          <Button variant="gold">
            <Upload aria-hidden />
            Téléverser
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Documents"
          value={String(documents.length)}
          detail="Agrégés depuis les transactions démo"
          icon={FileText}
          tone="primary"
        />
        <KpiCard
          label="Volume"
          value={formatFileSize(totalFileSize)}
          detail="Somme de file_size"
          icon={HardDrive}
          tone="accent"
        />
        <KpiCard
          label="États dérivés"
          value={String(derivedStates)}
          detail={`${attachedDocuments} documents joints`}
          icon={Database}
          tone="gold"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher fichier, type MIME, transaction..."
          onSearchChange={setSearch}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fichier</TableHead>
              <TableHead>Type MIME</TableHead>
              <TableHead className="text-right">Taille</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead>État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.map((document) => (
              <TableRow key={document.id}>
                <TableCell>
                  <p className="font-medium">{document.original_filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {document.stored_filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {document.file_path ?? 'Chemin de stockage non exposé en démo'}
                  </p>
                </TableCell>
                <TableCell>{document.mime_type}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatFileSize(document.file_size)}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{document.transaction_description}</p>
                  <p className="text-xs text-muted-foreground">
                    transaction_id: {document.transaction_id}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(document.created_at)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={document.state} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    État UI dérivé
                  </p>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredDocuments.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
            Aucun document ne correspond à la recherche.
          </div>
        ) : null}
      </div>
    </section>
  )
}
