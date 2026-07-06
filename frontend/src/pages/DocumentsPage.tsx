import { useMemo, useState } from 'react'
import { Download, Eye, Upload, X } from 'lucide-react'

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
import type { DocumentRowViewModel } from '@/demo/types'
import { formatDate, formatFileSize } from '@/lib/format'

type DocumentAction = 'view' | 'download'

function formatTransactionTitle(description: string): string {
  const [documentLabel, ...subjectParts] = description.split(' - ')
  const subject = subjectParts.join(' - ')

  if (!subject) return description

  return `${subject} - ${documentLabel}`
}

export function DocumentsPage() {
  const [search, setSearch] = useState('')
  const [selectedAction, setSelectedAction] = useState<DocumentAction | null>(
    null,
  )
  const [selectedDocument, setSelectedDocument] =
    useState<DocumentRowViewModel | null>(null)
  const documents = useMemo(
    () =>
      [...documentsViewModel.documents].sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      ),
    [],
  )
  const normalizedSearch = search.trim().toLowerCase()
  const filteredDocuments = useMemo(() => {
    if (!normalizedSearch) return documents

    return documents.filter((document) =>
      [
        document.original_filename,
        document.transaction_type,
        document.transaction_description,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch),
        ),
    )
  }, [documents, normalizedSearch])

  function openPlaceholderModal(
    action: DocumentAction,
    document: DocumentRowViewModel,
  ) {
    setSelectedAction(action)
    setSelectedDocument(document)
  }

  function closePlaceholderModal() {
    setSelectedAction(null)
    setSelectedDocument(null)
  }

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

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher fichier, type, transaction..."
          onSearchChange={setSearch}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fichier</TableHead>
              <TableHead className="min-w-32">Type</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead className="min-w-20 text-right">Taille</TableHead>
              <TableHead className="text-center!">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDocuments.map((document) => (
              <TableRow key={document.id}>
                <TableCell className="font-medium">
                  {document.original_filename}
                </TableCell>
                <TableCell className="min-w-32 whitespace-nowrap">
                  <StatusBadge status={document.transaction_type} />
                </TableCell>
                <TableCell className="font-medium">
                  {formatTransactionTitle(document.transaction_description)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(document.created_at)}
                </TableCell>
                <TableCell className="min-w-20 whitespace-nowrap text-right font-medium">
                  {formatFileSize(document.file_size)}
                </TableCell>
                <TableCell className="text-center">
                  <div className="inline-flex justify-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Voir ${document.original_filename}`}
                      onClick={() => openPlaceholderModal('view', document)}
                    >
                      <Eye aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Télécharger ${document.original_filename}`}
                      onClick={() => openPlaceholderModal('download', document)}
                    >
                      <Download aria-hidden />
                    </Button>
                  </div>
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

      {selectedAction !== null && selectedDocument !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">
                  {selectedAction === 'view'
                    ? 'Aperçu du document'
                    : 'Téléchargement du document'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedDocument.original_filename}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Fermer"
                onClick={closePlaceholderModal}
              >
                <X aria-hidden />
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Cette action sera branchée sur le vrai flux document plus tard.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
