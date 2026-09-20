import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, FileText, Mail, Plus } from 'lucide-react'

import { useDocumentsQuery } from '@/api/documents'
import { getApiErrorMessage } from '@/api/client'
import { useSuppliersQuery } from '@/api/suppliers'
import type { SupplierDocumentListRead } from '@/api/types'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { PaginationFooter } from '@/components/shared/PaginationFooter'
import { TableToolbar } from '@/components/shared/TableToolbar'
import {
  paginationPageSizeOptions,
  usePagination,
} from '@/components/shared/usePagination'
import { SupplierModal } from '@/components/suppliers/SupplierModal'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPhoneNumber } from '@/lib/phone'
import {
  copyEmailToClipboard,
  phoneHref,
  primaryContact,
} from '@/lib/supplierContact'
import { supplierToDomain } from '@/lib/apiAdapters'
import { useSupplierActions } from '@/hooks/useSupplierActions'
import { useSupplierRibViewer } from '@/hooks/useSupplierRibViewer'
import { useSelectedProjectId } from '@/state/appState'

export function SuppliersPage() {
  const projectId = useSelectedProjectId()
  const [search, setSearch] = useState('')
  // The list creates; a supplier's own page is where one is read and edited.
  const [isCreating, setIsCreating] = useState(false)
  const suppliersQuery = useSuppliersQuery()
  const documentsQuery = useDocumentsQuery()
  const { saveSupplier } = useSupplierActions(projectId)
  const ribViewer = useSupplierRibViewer()
  const suppliers = useMemo(
    () => (suppliersQuery.data ?? []).map(supplierToDomain),
    [suppliersQuery.data],
  )
  const ribBySupplierId = useMemo(() => {
    const map = new Map<number, SupplierDocumentListRead>()
    for (const document of documentsQuery.data ?? []) {
      if (document.type === 'supplier_document') {
        map.set(document.supplier_id, document)
      }
    }
    return map
  }, [documentsQuery.data])
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
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch),
        ),
    )
  }, [normalizedSearch, suppliers])
  const {
    pageItems: paginatedSuppliers,
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage,
    totalPages,
    pageStart,
    totalCount,
  } = usePagination(filteredSuppliers, `${normalizedSearch}|${projectId}`)
  const supplierCountLabel = `${filteredSuppliers.length} fournisseur${
    filteredSuppliers.length > 1 ? 's' : ''
  }`
  const isLoadingSuppliers = suppliersQuery.isLoading
  const suppliersError = suppliersQuery.isError
    ? getApiErrorMessage(suppliersQuery.error)
    : null
  const showEmptyState =
    !isLoadingSuppliers && !suppliersError && filteredSuppliers.length === 0
  const showRefreshState =
    suppliersQuery.isFetching && !isLoadingSuppliers && !suppliersError

  function emptyStateMessage() {
    if (search.trim() !== '') {
      return 'Aucun fournisseur ne correspond à la recherche.'
    }

    return 'Aucun fournisseur enregistré.'
  }

  function renderTableBody() {
    if (isLoadingSuppliers) {
      return (
        <TableRow>
          <TableCell
            colSpan={5}
            className="py-8 text-center text-muted-foreground"
          >
            Chargement des fournisseurs...
          </TableCell>
        </TableRow>
      )
    }

    if (suppliersError) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="py-8 text-center text-destructive">
            Impossible de charger les fournisseurs.
          </TableCell>
        </TableRow>
      )
    }

    return paginatedSuppliers.map((supplier) => {
      const contact = primaryContact(supplier)
      const contactEmail = contact?.email?.trim() ?? ''
      const hasEmail = contactEmail !== ''
      const rib = ribBySupplierId.get(Number(supplier.id))

      return (
        <TableRow key={supplier.id}>
          <TableCell className="group transition-colors hover:bg-gold/15">
            <Link
              to={`/suppliers/${supplier.id}`}
              className="flex w-full flex-col items-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="w-full truncate font-medium text-foreground group-hover:text-gold">
                {supplier.name}
              </span>
              {supplier.comment.trim() !== '' ? (
                <span className="w-full truncate text-xs text-muted-foreground">
                  {supplier.comment}
                </span>
              ) : null}
            </Link>
          </TableCell>
          <TableCell>{contact?.name}</TableCell>
          <TableCell className="whitespace-nowrap">
            {contact?.phone_number ? (
              <a
                className="-mx-2 -my-1 inline-flex rounded-md px-2 py-1 text-gold underline underline-offset-4 transition-colors hover:bg-gold/15 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={phoneHref(contact.phone_number)}
              >
                {formatPhoneNumber(contact.phone_number)}
              </a>
            ) : null}
          </TableCell>
          <TableCell>
            <div className="flex min-w-0 items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{contact?.email}</span>
              <span className="inline-flex shrink-0 justify-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-gold/15 hover:text-gold"
                  aria-label={
                    hasEmail
                      ? `Copier l'email de ${supplier.name}`
                      : `Aucun email à copier pour ${supplier.name}`
                  }
                  disabled={!hasEmail}
                  onClick={() => void copyEmailToClipboard(contactEmail)}
                >
                  <Copy aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-gold/15 hover:text-gold"
                  aria-label={
                    hasEmail
                      ? `Envoyer un email à ${supplier.name}`
                      : `Aucun email pour ${supplier.name}`
                  }
                  disabled={!hasEmail}
                  onClick={() => {
                    window.location.href = `mailto:${encodeURIComponent(contactEmail)}`
                  }}
                >
                  <Mail aria-hidden />
                </Button>
              </span>
            </div>
          </TableCell>
          <TableCell className="text-center">
            {rib ? (
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:bg-gold/15 hover:text-gold"
                aria-label={`Voir le RIB de ${supplier.name}`}
                onClick={() => void ribViewer.open(rib)}
              >
                <FileText aria-hidden />
              </Button>
            ) : null}
          </TableCell>
        </TableRow>
      )
    })
  }

  return (
    <section>
      <PageHeader
        title="Fournisseurs"
        description="Répertoire des artisans et fournisseurs."
        actions={
          <Button variant="gold" onClick={() => setIsCreating(true)}>
            <Plus aria-hidden />
            Nouveau fournisseur
          </Button>
        }
      />

      {suppliersError ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {suppliersError}
          <Button
            className="ml-3"
            size="sm"
            variant="outline"
            onClick={() => void suppliersQuery.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher fournisseur, contact, email..."
          onSearchChange={setSearch}
          actions={
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">{supplierCountLabel}</span>
              <Select
                className="w-24"
                aria-label="Fournisseurs par page"
                value={String(pageSize)}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {paginationPageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} / p.
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        {showRefreshState ? (
          <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Actualisation des fournisseurs...
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Contact principal</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-20">
                <span className="block text-center">RIB</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderTableBody()}</TableBody>
        </Table>
        <PaginationFooter
          pageStart={pageStart}
          pageSize={pageSize}
          totalCount={totalCount}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
        {showEmptyState ? (
          <div className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
            {emptyStateMessage()}
          </div>
        ) : null}
      </div>

      {isCreating ? (
        <SupplierModal
          mode="create"
          supplier={null}
          onClose={() => setIsCreating(false)}
          onSave={(supplier) => saveSupplier(supplier, null)}
        />
      ) : null}

      {ribViewer.rib ? (
        <DocumentViewerDialog
          title={`RIB • ${ribViewer.rib.document.supplier_name}`}
          url={ribViewer.rib.url}
          isPending={ribViewer.isLoading}
          error={ribViewer.error}
          onClose={ribViewer.close}
          onDownload={() => void ribViewer.download()}
        />
      ) : null}
    </section>
  )
}
