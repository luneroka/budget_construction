import { type FormEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  FolderPlus,
  Layers,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Navigate } from 'react-router-dom'

import { getApiErrorMessage } from '@/api/client'
import {
  lotQueryKeys,
  useCreateGlobalLotMutation,
  useDeleteGlobalLotMutation,
  useGlobalLotsQuery,
  useMoveGlobalLotMutation,
  useUpdateGlobalLotMutation,
} from '@/api/lots'
import type { GlobalLotRead } from '@/api/types'
import { useAuth } from '@/auth/authContext'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { SettingsBackButton } from '@/components/shared/SettingsBackButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  EMPTY_NEW_LOT_FORM,
  LOT_CODE_MAX_LENGTH,
  LOT_DESIGNATION_MAX_LENGTH,
  type LotDeletion,
  type NewLotForm,
  deleteLotConfirmation,
  deleteLotLabel,
  newLotPayload,
  refusedLotDeletion,
  refusedNewLot,
} from '@/lib/adminLots'
import { notifyError, notifySuccess } from '@/lib/toasts'

type Draft = { lotId: number; code: string; designation: string }

// The global lots every project sees. An admin adds, renames, reorders and
// deletes them here; the API refuses to delete a lot any transaction uses.
export function AdminLotsPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = currentUser?.is_admin ?? false
  const lotsQuery = useGlobalLotsQuery({ enabled: isAdmin })
  const updateMutation = useUpdateGlobalLotMutation()
  const moveMutation = useMoveGlobalLotMutation()
  const createMutation = useCreateGlobalLotMutation()
  const deleteMutation = useDeleteGlobalLotMutation()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [newLot, setNewLot] = useState<NewLotForm | null>(null)
  const [deletion, setDeletion] = useState<LotDeletion | null>(null)

  if (currentUser && !isAdmin) {
    return <Navigate to="/settings" replace />
  }

  const lots = lotsQuery.data ?? []
  const isBusy =
    updateMutation.isPending ||
    moveMutation.isPending ||
    createMutation.isPending ||
    deleteMutation.isPending

  async function refreshLots() {
    // Every project's lots and totals show the change: a lot added or
    // deleted, a new name or order.
    await queryClient.invalidateQueries({ queryKey: lotQueryKeys.all })
    await queryClient.invalidateQueries({ queryKey: ['projects'] })
    await queryClient.invalidateQueries({ queryKey: ['transactions'] })
  }

  function startEditing(lot: GlobalLotRead) {
    setDraftError(null)
    setDraft({ lotId: lot.id, code: lot.code, designation: lot.designation })
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    setDraftError(null)

    try {
      await updateMutation.mutateAsync({
        lotId: draft.lotId,
        lot: { code: draft.code.trim(), designation: draft.designation.trim() },
      })
      notifySuccess('Lot renommé dans tous les projets.')
      setDraft(null)
      await refreshLots()
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDraftError(message)
      notifyError(`Impossible de renommer le lot. ${message}`)
    }
  }

  async function saveNewLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newLot) return
    const payload = newLotPayload(newLot)
    if (!payload) return
    setNewLot({ ...newLot, error: null })

    try {
      await createMutation.mutateAsync(payload)
      notifySuccess('Lot ajouté à tous les projets.')
      setNewLot(null)
      await refreshLots()
    } catch (error) {
      const refused = refusedNewLot(newLot, error)
      setNewLot(refused)
      notifyError(`Impossible d'ajouter le lot. ${refused.error}`)
    }
  }

  async function confirmDeletion() {
    if (!deletion) return
    setDeletion({ ...deletion, error: null })

    try {
      await deleteMutation.mutateAsync(deletion.lot.id)
      notifySuccess('Lot supprimé de tous les projets.')
      setDeletion(null)
      await refreshLots()
    } catch (error) {
      setDeletion(refusedLotDeletion(deletion, error))
    }
  }

  async function move(lot: GlobalLotRead, direction: 'up' | 'down') {
    try {
      await moveMutation.mutateAsync({ lotId: lot.id, direction })
      await refreshLots()
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    }
  }

  return (
    <section>
      <SettingsBackButton />
      <PageHeader
        title="Lots"
        description="Les lots communs à tous les projets. Un ajout, un renommage, un changement d'ordre ou une suppression s'applique immédiatement à chaque projet."
        actions={
          <Button
            variant="gold"
            disabled={isBusy || newLot !== null || !lotsQuery.isSuccess}
            onClick={() => setNewLot(EMPTY_NEW_LOT_FORM)}
          >
            <FolderPlus aria-hidden="true" />
            Ajouter un lot
          </Button>
        }
      />

      <SectionCard
        title="Lots globaux"
        description="Chaque projet peut masquer un lot depuis la page Lots. Un lot utilisé par un devis ou une facture, même à la corbeille, ne peut pas être supprimé."
        icon={Layers}
      >
        {lotsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : lotsQuery.isError ? (
          <p className="text-sm text-destructive">
            {getApiErrorMessage(lotsQuery.error)}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Code</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((lot, index) => {
                const isEditing = draft?.lotId === lot.id

                if (isEditing) {
                  return (
                    <TableRow key={lot.id}>
                      <TableCell colSpan={3}>
                        <form
                          className="space-y-2"
                          onSubmit={saveDraft}
                          // Not a modal: keeps AutoUpdate from reloading a
                          // half-typed rename away.
                          data-blocks-auto-update
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              aria-label="Code du lot"
                              className="w-28"
                              required
                              maxLength={LOT_CODE_MAX_LENGTH}
                              value={draft.code}
                              onChange={(event) =>
                                setDraft({ ...draft, code: event.target.value })
                              }
                            />
                            <Input
                              aria-label="Désignation du lot"
                              className="min-w-48 flex-1"
                              required
                              maxLength={LOT_DESIGNATION_MAX_LENGTH}
                              value={draft.designation}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  designation: event.target.value,
                                })
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              disabled={updateMutation.isPending}
                              onClick={() => setDraft(null)}
                            >
                              Annuler
                            </Button>
                            <Button
                              type="submit"
                              variant="gold"
                              disabled={updateMutation.isPending}
                            >
                              {updateMutation.isPending ? (
                                <Loader2 className="animate-spin" aria-hidden />
                              ) : null}
                              Enregistrer
                            </Button>
                          </div>
                          {draftError ? (
                            <p
                              className="text-sm text-destructive"
                              role="alert"
                            >
                              {draftError}
                            </p>
                          ) : null}
                        </form>
                      </TableCell>
                    </TableRow>
                  )
                }

                return (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium tabular-nums">
                      {lot.code}
                    </TableCell>
                    <TableCell>{lot.designation}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Monter le lot ${lot.code}`}
                          disabled={isBusy || index === 0}
                          onClick={() => void move(lot, 'up')}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Descendre le lot ${lot.code}`}
                          disabled={isBusy || index === lots.length - 1}
                          onClick={() => void move(lot, 'down')}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Renommer le lot ${lot.code}`}
                          disabled={isBusy || draft !== null}
                          onClick={() => startEditing(lot)}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={deleteLotLabel(lot)}
                          disabled={isBusy}
                          onClick={() => setDeletion({ lot, error: null })}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {newLot ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <form
                      className="space-y-2"
                      onSubmit={saveNewLot}
                      // Not a modal: keeps AutoUpdate from reloading a
                      // half-typed lot away.
                      data-blocks-auto-update
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label="Code du nouveau lot"
                          placeholder="Code"
                          className="w-28"
                          required
                          autoFocus
                          maxLength={LOT_CODE_MAX_LENGTH}
                          value={newLot.code}
                          onChange={(event) =>
                            setNewLot({ ...newLot, code: event.target.value })
                          }
                        />
                        <Input
                          aria-label="Désignation du nouveau lot"
                          placeholder="Désignation"
                          className="min-w-48 flex-1"
                          required
                          maxLength={LOT_DESIGNATION_MAX_LENGTH}
                          value={newLot.designation}
                          onChange={(event) =>
                            setNewLot({
                              ...newLot,
                              designation: event.target.value,
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={createMutation.isPending}
                          onClick={() => setNewLot(null)}
                        >
                          Annuler
                        </Button>
                        <Button
                          type="submit"
                          variant="gold"
                          disabled={
                            createMutation.isPending ||
                            newLotPayload(newLot) === null
                          }
                        >
                          {createMutation.isPending ? (
                            <Loader2 className="animate-spin" aria-hidden />
                          ) : null}
                          Ajouter
                        </Button>
                      </div>
                      {newLot.error ? (
                        <p className="text-sm text-destructive" role="alert">
                          {newLot.error}
                        </p>
                      ) : null}
                    </form>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {deletion ? (
        <ConfirmationDialog
          {...deleteLotConfirmation(deletion.lot)}
          error={deletion.error}
          isPending={deleteMutation.isPending}
          onCancel={() => setDeletion(null)}
          onConfirm={() => void confirmDeletion()}
        />
      ) : null}
    </section>
  )
}
