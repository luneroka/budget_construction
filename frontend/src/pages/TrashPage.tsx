import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'

import { invalidateTrashAffectedQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useEmptyProjectTrashMutation,
  useHardDeleteTrashDocumentMutation,
  useHardDeleteTrashSupplierMutation,
  useHardDeleteTrashTransactionMutation,
  useProjectTrashQuery,
  useRestoreTrashDocumentMutation,
  useRestoreTrashSupplierMutation,
  useRestoreTrashTransactionMutation,
} from '@/api/trash'
import type { TrashItemRead } from '@/api/types'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableToolbar } from '@/components/shared/TableToolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

type TrashFilter = 'all' | TrashItemRead['type']
type PendingHardDelete =
  { type: 'item'; item: TrashItemRead } | { type: 'empty' } | null
type TrashCounts = Record<TrashItemRead['type'], number>

const typeLabels: Record<TrashItemRead['type'], string> = {
  transaction: 'Transaction',
  document: 'Document',
  supplier: 'Fournisseur',
}

const filterOptions: Array<{ value: TrashFilter; label: string }> = [
  { value: 'all', label: 'Tout' },
  { value: 'transaction', label: 'Transactions' },
  { value: 'document', label: 'Documents' },
  { value: 'supplier', label: 'Fournisseurs' },
]
const destructiveGhostButtonClass =
  'text-destructive hover:bg-destructive hover:text-destructive-foreground'
const permanentDeleteDescription =
  'Cette action est irréversible. Les éléments supprimés définitivement ne pourront plus être restaurés.'

function selectedProjectIdFromState(selectedProjectId: string): number | null {
  const numericProjectId = Number(selectedProjectId)
  return Number.isInteger(numericProjectId) && numericProjectId > 0
    ? numericProjectId
    : null
}

function itemContext(item: TrashItemRead): string {
  if (item.type === 'transaction') {
    return [
      item.supplier_name ?? 'Autoconstruction',
      item.product_name,
      formatCurrency(Number(item.amount_ttc)),
    ].join(' · ')
  }

  if (item.type === 'document') {
    return [
      item.transaction_name,
      item.supplier_name ?? 'Autoconstruction',
    ].join(' · ')
  }

  return `${item.linked_transaction_count} transaction${
    item.linked_transaction_count > 1 ? 's' : ''
  } liée${item.linked_transaction_count > 1 ? 's' : ''}`
}

function itemStatus(item: TrashItemRead): string {
  if (item.type === 'document' && !item.can_restore) {
    return 'Restauration indisponible. Restaurez d’abord la transaction parente.'
  }

  return 'Restaurable'
}

function hardDeleteDescription(item: TrashItemRead): string {
  if (item.type === 'transaction') {
    return 'Cette opération supprimera définitivement cette transaction ainsi que ses documents associés.'
  }

  if (item.type === 'document') {
    return 'Cette opération supprimera définitivement ce document ainsi que son fichier stocké.'
  }

  return 'Cette opération supprimera définitivement ce fournisseur et ses contacts. Les transactions liées seront conservées sans fournisseur.'
}

function countTrashItems(items: TrashItemRead[]): TrashCounts {
  return items.reduce<TrashCounts>(
    (counts, item) => ({
      ...counts,
      [item.type]: counts[item.type] + 1,
    }),
    { transaction: 0, document: 0, supplier: 0 },
  )
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count > 1 ? plural : singular}`
}

function itemMatchesSearch(item: TrashItemRead, search: string): boolean {
  if (!search) return true

  const values = [
    typeLabels[item.type],
    item.name,
    itemContext(item),
    formatDate(item.deleted_at),
    itemStatus(item),
  ]

  return values.some((value) => value.toLowerCase().includes(search))
}

export function TrashPage() {
  const queryClient = useQueryClient()
  const { selectedProjectId } = useAppState()
  const projectId = selectedProjectIdFromState(selectedProjectId)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TrashFilter>('all')
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null)
  const [pendingHardDelete, setPendingHardDelete] =
    useState<PendingHardDelete>(null)
  const trashQuery = useProjectTrashQuery(projectId, { enabled: true })
  const restoreTransactionMutation = useRestoreTrashTransactionMutation()
  const restoreDocumentMutation = useRestoreTrashDocumentMutation()
  const restoreSupplierMutation = useRestoreTrashSupplierMutation()
  const hardDeleteTransactionMutation = useHardDeleteTrashTransactionMutation()
  const hardDeleteDocumentMutation = useHardDeleteTrashDocumentMutation()
  const hardDeleteSupplierMutation = useHardDeleteTrashSupplierMutation()
  const emptyTrashMutation = useEmptyProjectTrashMutation()
  const normalizedSearch = search.trim().toLowerCase()
  const filteredItems = useMemo(
    () =>
      (trashQuery.data ?? []).filter(
        (item) =>
          (typeFilter === 'all' || item.type === typeFilter) &&
          itemMatchesSearch(item, normalizedSearch),
      ),
    [trashQuery.data, normalizedSearch, typeFilter],
  )
  const trashError = trashQuery.isError
    ? getApiErrorMessage(trashQuery.error)
    : null
  const isLoadingTrash = trashQuery.isLoading
  const showRefreshState =
    trashQuery.isFetching && !isLoadingTrash && !trashError
  const showEmptyState =
    !isLoadingTrash && !trashError && filteredItems.length === 0
  const trashItemCount = trashQuery.data?.length ?? 0
  const trashCounts = useMemo(
    () => countTrashItems(trashQuery.data ?? []),
    [trashQuery.data],
  )
  const isHardDeletePending =
    hardDeleteTransactionMutation.isPending ||
    hardDeleteDocumentMutation.isPending ||
    hardDeleteSupplierMutation.isPending ||
    emptyTrashMutation.isPending

  async function restoreItem(item: TrashItemRead) {
    if (projectId === null) return
    if (item.type === 'document' && !item.can_restore) return

    const itemKey = `${item.type}-${item.id}`
    setActiveItemKey(itemKey)

    try {
      if (item.type === 'transaction') {
        await restoreTransactionMutation.mutateAsync({
          projectId,
          transactionId: item.id,
        })
        invalidateTrashAffectedQueries(queryClient, projectId, item.id)
        notifySuccess('Transaction restaurée.')
      } else if (item.type === 'document') {
        await restoreDocumentMutation.mutateAsync({
          projectId,
          documentId: item.id,
        })
        invalidateTrashAffectedQueries(
          queryClient,
          projectId,
          item.transaction_id,
        )
        notifySuccess('Document restauré.')
      } else {
        await restoreSupplierMutation.mutateAsync({
          projectId,
          supplierId: item.id,
        })
        invalidateTrashAffectedQueries(queryClient, projectId)
        notifySuccess('Fournisseur restauré.')
      }
    } catch (error) {
      const message = getApiErrorMessage(error)
      notifyError(`Impossible de restaurer l’élément. ${message}`)
    } finally {
      setActiveItemKey(null)
    }
  }

  async function hardDeleteItem(item: TrashItemRead) {
    if (projectId === null) return

    const itemKey = `${item.type}-${item.id}`
    setActiveItemKey(itemKey)

    try {
      if (item.type === 'transaction') {
        await hardDeleteTransactionMutation.mutateAsync({
          projectId,
          transactionId: item.id,
        })
        invalidateTrashAffectedQueries(queryClient, projectId, item.id)
        notifySuccess('Transaction supprimée définitivement.')
      } else if (item.type === 'document') {
        await hardDeleteDocumentMutation.mutateAsync({
          projectId,
          documentId: item.id,
        })
        invalidateTrashAffectedQueries(
          queryClient,
          projectId,
          item.transaction_id,
        )
        notifySuccess('Document supprimé définitivement.')
      } else {
        await hardDeleteSupplierMutation.mutateAsync({
          projectId,
          supplierId: item.id,
        })
        invalidateTrashAffectedQueries(queryClient, projectId)
        notifySuccess('Fournisseur supprimé définitivement.')
      }
    } catch (error) {
      const message = getApiErrorMessage(error)
      notifyError(`Impossible de supprimer définitivement. ${message}`)
    } finally {
      setActiveItemKey(null)
      setPendingHardDelete(null)
    }
  }

  async function emptyTrash() {
    if (projectId === null) return

    setActiveItemKey('empty-trash')

    try {
      await emptyTrashMutation.mutateAsync({ projectId })
      invalidateTrashAffectedQueries(queryClient, projectId)
      notifySuccess('Corbeille vidée.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      notifyError(`Impossible de vider la corbeille. ${message}`)
    } finally {
      setActiveItemKey(null)
      setPendingHardDelete(null)
    }
  }

  function emptyStateMessage() {
    if (search.trim() !== '' || typeFilter !== 'all') {
      return 'Aucun élément de la corbeille ne correspond aux filtres.'
    }

    return 'La corbeille de ce projet est vide.'
  }

  function renderTableBody() {
    if (projectId === null) {
      return (
        <TableRow>
          <TableCell
            colSpan={6}
            className="py-8 text-center text-muted-foreground"
          >
            Sélectionnez un projet pour consulter sa corbeille.
          </TableCell>
        </TableRow>
      )
    }

    if (isLoadingTrash) {
      return (
        <TableRow>
          <TableCell
            colSpan={6}
            className="py-8 text-center text-muted-foreground"
          >
            Chargement de la corbeille...
          </TableCell>
        </TableRow>
      )
    }

    if (trashError) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="py-8 text-center text-destructive">
            Impossible de charger la corbeille.
          </TableCell>
        </TableRow>
      )
    }

    return filteredItems.map((item) => {
      const itemKey = `${item.type}-${item.id}`
      const isBusy = activeItemKey === itemKey
      const isRestoreDisabled = item.type === 'document' && !item.can_restore

      return (
        <TableRow key={itemKey}>
          <TableCell className="whitespace-nowrap">
            <Badge variant="muted">{typeLabels[item.type]}</Badge>
          </TableCell>
          <TableCell>
            <p className="font-medium text-foreground">{item.name}</p>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {itemContext(item)}
          </TableCell>
          <TableCell className="min-w-28 whitespace-nowrap">
            {formatDate(item.deleted_at)}
          </TableCell>
          <TableCell>
            <span
              className={
                isRestoreDisabled ? 'text-warning' : 'text-muted-foreground'
              }
            >
              {itemStatus(item)}
            </span>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isBusy || isRestoreDisabled || isHardDeletePending}
                title={isRestoreDisabled ? itemStatus(item) : undefined}
                onClick={() => void restoreItem(item)}
              >
                <RotateCcw aria-hidden />
                Restaurer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={destructiveGhostButtonClass}
                disabled={isBusy || isHardDeletePending}
                onClick={() => setPendingHardDelete({ type: 'item', item })}
              >
                <Trash2 aria-hidden />
                Supprimer définitivement
              </Button>
            </div>
          </TableCell>
        </TableRow>
      )
    })
  }

  return (
    <section>
      <PageHeader
        title="Corbeille"
        description="Voir et gérer tous les éléments supprimés (transactions, fournisseurs et documents)."
      />

      {trashError ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {trashError}
          <Button
            className="ml-3"
            size="sm"
            variant="outline"
            onClick={() => void trashQuery.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          searchValue={search}
          searchPlaceholder="Rechercher nom, contexte, statut..."
          onSearchChange={setSearch}
          actions={
            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={
                    typeFilter === option.value ? 'secondary' : 'outline'
                  }
                  onClick={() => setTypeFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className={destructiveGhostButtonClass}
                disabled={
                  projectId === null ||
                  trashItemCount === 0 ||
                  isLoadingTrash ||
                  isHardDeletePending
                }
                onClick={() => setPendingHardDelete({ type: 'empty' })}
              >
                <Trash2 aria-hidden />
                Vider la corbeille
              </Button>
            </div>
          }
        />
        {showRefreshState ? (
          <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
            Actualisation de la corbeille...
          </div>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Contexte</TableHead>
              <TableHead className="min-w-28 whitespace-nowrap">
                Supprimé le
              </TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right!">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{renderTableBody()}</TableBody>
        </Table>
        {showEmptyState ? (
          <div className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
            {emptyStateMessage()}
          </div>
        ) : null}
      </div>
      {pendingHardDelete?.type === 'item' ? (
        <ConfirmationDialog
          title="Supprimer définitivement"
          description={permanentDeleteDescription}
          isPending={isHardDeletePending}
          confirmLabel="Supprimer définitivement"
          pendingLabel="Suppression..."
          onCancel={() => {
            if (isHardDeletePending) return
            setPendingHardDelete(null)
          }}
          onConfirm={() => void hardDeleteItem(pendingHardDelete.item)}
        >
          <p className="font-medium text-foreground">
            {pendingHardDelete.item.name}
          </p>
          <p className="mt-1 text-muted-foreground">
            {typeLabels[pendingHardDelete.item.type]} ·{' '}
            {itemContext(pendingHardDelete.item)}
          </p>
          <p className="mt-3 text-destructive">
            {hardDeleteDescription(pendingHardDelete.item)}
          </p>
        </ConfirmationDialog>
      ) : null}
      {pendingHardDelete?.type === 'empty' ? (
        <ConfirmationDialog
          title="Supprimer définitivement"
          description={permanentDeleteDescription}
          isPending={isHardDeletePending}
          confirmLabel="Vider la corbeille"
          pendingLabel="Suppression..."
          onCancel={() => {
            if (isHardDeletePending) return
            setPendingHardDelete(null)
          }}
          onConfirm={() => void emptyTrash()}
        >
          <p className="font-medium text-foreground">Impact de l’opération</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>
              {formatCount(
                trashCounts.transaction,
                'transaction',
                'transactions',
              )}
            </li>
            <li>
              {formatCount(trashCounts.document, 'document', 'documents')}
            </li>
            <li>
              {formatCount(trashCounts.supplier, 'fournisseur', 'fournisseurs')}
            </li>
          </ul>
          <p className="mt-3 text-destructive">
            Les transactions supprimeront aussi leurs documents associés et les
            fichiers stockés. Les fournisseurs supprimés seront détachés des
            transactions conservées.
          </p>
        </ConfirmationDialog>
      ) : null}
    </section>
  )
}
