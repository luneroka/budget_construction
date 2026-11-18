import { type FormEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, FolderPlus, Layers } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { invalidateProjectFinancialQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useCreateProjectLotMutation,
  useProjectLotsQuery,
  useSetLotHiddenMutation,
} from '@/api/lots'
import { useProjectFinancialSummaryQuery } from '@/api/projects'
import type { LotFinancialSummaryRead, ProjectLotRead } from '@/api/types'
import { Field } from '@/components/budget/transaction-form/TransactionFormFields'
import {
  ModalCancelButton,
  ModalSaveButton,
  ModalShell,
} from '@/components/shared/ModalShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { decimalToNumber } from '@/lib/apiAdapters'
import { formatCurrency } from '@/lib/format'
import { hiddenLots } from '@/lib/lots'
import { lotLabel } from '@/lib/transactionWorkspace'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { cn } from '@/lib/utils'
import { useSelectedProjectId } from '@/state/appState'

// The limits the API enforces on a lot.
const LOT_CODE_MAX_LENGTH = 10
const LOT_DESIGNATION_MAX_LENGTH = 120

function AddProjectLotModal({
  projectId,
  onClose,
}: {
  projectId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const createMutation = useCreateProjectLotMutation()
  const [code, setCode] = useState('')
  const [designation, setDesignation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      await createMutation.mutateAsync({
        projectId,
        lot: { code: code.trim(), designation: designation.trim() },
      })
      invalidateProjectFinancialQueries(queryClient, projectId)
      notifySuccess('Lot ajouté au projet.')
      onClose()
    } catch (createError) {
      const message = getApiErrorMessage(createError)
      setError(message)
      notifyError(`Impossible d’ajouter le lot. ${message}`)
    }
  }

  return (
    <ModalShell
      size="narrow"
      title="Nouveau lot"
      subtitle="Propre à ce projet. Son code et sa désignation ne pourront plus être modifiés : un lot mal saisi se masque et se recrée."
      icon={<FolderPlus className="h-5 w-5" aria-hidden="true" />}
      closeDisabled={createMutation.isPending}
      hasUnsavedChanges={code !== '' || designation !== ''}
      onClose={onClose}
      footer={
        <>
          <ModalCancelButton
            onClick={onClose}
            disabled={createMutation.isPending}
          />
          <ModalSaveButton
            form="project-lot-form"
            disabled={createMutation.isPending}
            isSaving={createMutation.isPending}
          >
            Ajouter le lot
          </ModalSaveButton>
        </>
      }
    >
      <form id="project-lot-form" className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field label="Code" htmlFor="project-lot-code">
            <Input
              id="project-lot-code"
              required
              maxLength={LOT_CODE_MAX_LENGTH}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field label="Désignation" htmlFor="project-lot-designation">
            <Input
              id="project-lot-designation"
              required
              maxLength={LOT_DESIGNATION_MAX_LENGTH}
              value={designation}
              onChange={(event) => setDesignation(event.target.value)}
            />
          </Field>
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </form>
    </ModalShell>
  )
}

function remainderClass(lot: LotFinancialSummaryRead) {
  if (lot.is_overrun) return 'text-destructive'
  return decimalToNumber(lot.remaining_to_invoice_ttc) > 0
    ? 'text-foreground'
    : 'text-muted-foreground'
}

// Every visible lot of the project with its totals, empty lots included.
// A lot opens its page: its suppliers, their quotes and invoices.
export function LotsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = useSelectedProjectId()
  const summaryQuery = useProjectFinancialSummaryQuery(projectId)
  const lotsQuery = useProjectLotsQuery(projectId)
  const setHiddenMutation = useSetLotHiddenMutation()
  const [isAddingLot, setIsAddingLot] = useState(false)

  async function setHidden(lot: ProjectLotRead, isHidden: boolean) {
    if (projectId === null) return
    try {
      await setHiddenMutation.mutateAsync({
        projectId,
        lotId: lot.id,
        isHidden,
      })
      invalidateProjectFinancialQueries(queryClient, projectId)
      notifySuccess(
        isHidden
          ? `Lot ${lot.code} masqué dans ce projet.`
          : `Lot ${lot.code} affiché.`,
      )
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    }
  }

  if (!projectId) {
    return (
      <section>
        <PageHeader
          title="Lots"
          description="Sélectionnez un projet pour consulter ses lots."
        />
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Aucun projet actif.
        </div>
      </section>
    )
  }

  if (summaryQuery.isLoading || lotsQuery.isLoading) {
    return (
      <section>
        <PageHeader title="Lots" description="Chargement des lots du projet." />
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Chargement des lots
        </div>
      </section>
    )
  }

  if (summaryQuery.isError || lotsQuery.isError || !summaryQuery.data) {
    const error = summaryQuery.error ?? lotsQuery.error
    return (
      <section>
        <PageHeader
          title="Lots"
          description="Les lots du projet n'ont pas pu être chargés."
        />
        <div className="rounded-lg border border-destructive/30 bg-card p-4 text-sm">
          <p className="font-medium text-destructive">Lots indisponibles</p>
          <p className="mt-1 text-muted-foreground">
            {error ? getApiErrorMessage(error) : 'Aucune donnée reçue.'}
          </p>
        </div>
      </section>
    )
  }

  const summary = summaryQuery.data
  const projectLots = new Map(
    (lotsQuery.data ?? []).map((lot) => [lot.id, lot]),
  )
  const hidden = hiddenLots(lotsQuery.data)

  return (
    <section>
      <PageHeader
        title="Lots"
        description="Les lots du projet : devis retenus, facturé et reste à facturer. Un lot s'ouvre sur ses fournisseurs, leurs devis et leurs factures."
        actions={
          <Button variant="gold" onClick={() => setIsAddingLot(true)}>
            <FolderPlus aria-hidden="true" />
            Ajouter un lot
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead className="text-right">Devis retenus</TableHead>
              <TableHead className="text-right">Facturé</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Payé
              </TableHead>
              <TableHead className="text-right">Reste à facturer</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.lots.map((lot) => {
              const projectLot = projectLots.get(lot.lot_id)
              const isEmpty = lot.quote_count === 0 && lot.invoice_count === 0
              const canHide =
                projectLot !== undefined &&
                projectLot.active_transaction_count === 0

              return (
                <TableRow
                  key={lot.lot_id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest('button, a')
                    )
                      return
                    navigate(`/lots/${lot.lot_id}`)
                  }}
                >
                  <TableCell>
                    <Link
                      to={`/lots/${lot.lot_id}`}
                      className="font-medium text-foreground underline-offset-4 hover:text-gold hover:underline"
                    >
                      {lotLabel(lot)}
                    </Link>
                    {lot.is_global ? null : (
                      <Badge variant="muted" tone="soft" className="ml-2">
                        Projet
                      </Badge>
                    )}
                    {isEmpty ? (
                      <span className="block text-xs text-muted-foreground">
                        Aucun devis ni facture
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      decimalToNumber(lot.validated_quote_amount_ttc),
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(decimalToNumber(lot.invoiced_amount_ttc))}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatCurrency(
                      decimalToNumber(lot.paid_invoice_amount_ttc),
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      remainderClass(lot),
                    )}
                  >
                    {formatCurrency(
                      decimalToNumber(lot.remaining_to_invoice_ttc),
                    )}
                    {lot.is_overrun ? (
                      <Badge variant="destructive" tone="soft" className="ml-2">
                        Dépassement
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {canHide ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Masquer le lot ${lot.code} dans ce projet`}
                        disabled={setHiddenMutation.isPending}
                        onClick={() => void setHidden(projectLot, true)}
                      >
                        <EyeOff aria-hidden="true" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell>Total du projet</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(
                  decimalToNumber(summary.validated_quote_amount_ttc),
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(decimalToNumber(summary.invoiced_amount_ttc))}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {formatCurrency(
                  decimalToNumber(summary.paid_invoice_amount_ttc),
                )}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  summary.is_overrun && 'text-destructive',
                )}
              >
                {formatCurrency(
                  decimalToNumber(summary.remaining_to_invoice_ttc),
                )}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {hidden.length > 0 ? (
        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Lots masqués
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {hidden.map((lot) => (
              <li
                key={lot.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">{lotLabel(lot)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setHiddenMutation.isPending}
                  onClick={() => void setHidden(lot, false)}
                >
                  <Eye aria-hidden="true" />
                  Afficher
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {isAddingLot ? (
        <AddProjectLotModal
          projectId={projectId}
          onClose={() => setIsAddingLot(false)}
        />
      ) : null}
    </section>
  )
}
