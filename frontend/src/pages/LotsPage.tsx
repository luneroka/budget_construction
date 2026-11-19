import { type FormEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, FolderPlus, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

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
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'
import { hiddenLots } from '@/lib/lots'
import { moneyFigures } from '@/lib/supplierStats'
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

// The 25 default lots grouped by phase of the build; project lots get their
// own group at the end.
const lotPhases: { title: string; codes: string[] }[] = [
  {
    title: 'Préparation et gros œuvre',
    codes: ['00', '01', '02', '03', '04', '05'],
  },
  { title: 'Clos et couvert', codes: ['06', '07', '08', '09'] },
  { title: 'Second œuvre', codes: ['10', '11', '12', '13', '14'] },
  { title: 'Finitions', codes: ['15', '16', '17'] },
  {
    title: 'Extérieurs et options',
    codes: ['18', '19', '20', '21', '22', '23', '24'],
  },
]

function phaseRange(codes: string[]) {
  return `${codes[0]}–${codes[codes.length - 1]}`
}

// One lot: its number large, its name, then its Prévu, Facturé and À payer,
// À payer stressed while something is left to pay. A lot with nothing in it
// yet has a dashed outline.
function LotTile({
  lot,
  canHide,
  isHiding,
  onHide,
}: {
  lot: LotFinancialSummaryRead
  canHide: boolean
  isHiding: boolean
  onHide: () => void
}) {
  const figures = moneyFigures(lot)
  const count = figures.quoteCount + figures.invoiceCount
  const isEmpty = count === 0
  const hasToPay = figures.toPayTtc !== 0

  return (
    <div className="group relative">
      <Link
        to={`/lots/${lot.lot_id}`}
        aria-label={lotLabel(lot)}
        className={cn(
          'block h-full rounded-lg border bg-card px-2.5 py-2 text-left text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5',
          // An empty lot is still to quote: a dashed outline.
          isEmpty ? 'border-dashed border-border' : 'border-border',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-9 shrink-0 text-2xl leading-none font-semibold text-primary tabular-nums">
            {lot.code}
          </span>
          {/* Two lines tall on every card, the name centred in it, so a
              one-line name sits level with the number. */}
          <span className="flex min-h-10 min-w-0 flex-1 items-center">
            <span className="line-clamp-2 text-sm leading-5 font-semibold">
              {lot.designation}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground group-hover:invisible">
            {count}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t border-border/60 pt-1.5 text-[0.7rem] leading-4">
          <span className="min-w-0">
            <span className="block text-muted-foreground">Prévu</span>
            <span className="block truncate font-semibold tabular-nums">
              {formatCurrency(figures.plannedTtc)}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block text-muted-foreground">Facturé</span>
            <span className="block truncate font-semibold tabular-nums">
              {formatCurrency(figures.invoicedTtc)}
            </span>
          </span>
          <span className="min-w-0 text-right">
            <span className="block text-muted-foreground">À payer</span>
            <span
              className={cn(
                'block truncate tabular-nums',
                hasToPay
                  ? 'font-bold text-gold'
                  : 'font-semibold text-muted-foreground',
              )}
            >
              {formatCurrency(figures.toPayTtc)}
            </span>
          </span>
        </div>
      </Link>
      {canHide ? (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-card text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          aria-label={`Masquer le lot ${lot.code} dans ce projet`}
          disabled={isHiding}
          onClick={onHide}
        >
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

// Every visible lot of the project with its totals, empty lots included.
// A lot opens its page: its suppliers, their quotes and invoices.
export function LotsPage() {
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
        description="Les lots du projet : coût prévu, facturé et à payer. Un lot s'ouvre sur ses fournisseurs, leurs devis et leurs factures."
        actions={
          <Button variant="gold" onClick={() => setIsAddingLot(true)}>
            <FolderPlus aria-hidden="true" />
            Ajouter un lot
          </Button>
        }
      />

      {(() => {
        const figures = moneyFigures(summary)
        const stats = [
          { label: 'Coût prévu', value: formatCurrency(figures.plannedTtc) },
          { label: 'Facturé', value: formatCurrency(figures.invoicedTtc) },
          { label: 'Payé', value: formatCurrency(figures.paidTtc) },
          {
            label: 'À payer',
            value: formatCurrency(figures.toPayTtc),
            className: figures.toPayTtc !== 0 ? 'text-gold' : undefined,
          },
        ]
        return (
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border bg-card px-4 py-3"
              >
                <span className="block text-xs text-muted-foreground">
                  {stat.label}
                </span>
                <span
                  className={cn(
                    'mt-1 block text-xl font-semibold text-foreground tabular-nums',
                    stat.className,
                  )}
                >
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        )
      })()}

      {(() => {
        const lotsByCode = new Map(
          summary.lots
            .filter((lot) => lot.is_global)
            .map((lot) => [lot.code, lot]),
        )
        const placed = new Set<number>()
        const groups = lotPhases.map((phase) => {
          const lots = phase.codes.flatMap((code) => {
            const lot = lotsByCode.get(code)
            return lot ? [lot] : []
          })
          lots.forEach((lot) => placed.add(lot.lot_id))
          return { title: `${phase.title} · ${phaseRange(phase.codes)}`, lots }
        })
        // Re-coded global lots and the project's own lots.
        const others = summary.lots.filter((lot) => !placed.has(lot.lot_id))
        if (others.length > 0)
          groups.push({ title: 'Autres lots', lots: others })

        return (
          <div className="space-y-6">
            {groups
              .filter((group) => group.lots.length > 0)
              .map((group) => (
                <div key={group.title}>
                  <h2 className="mb-2 font-[family-name:var(--font-body)] text-sm font-semibold text-muted-foreground">
                    {group.title}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {group.lots.map((lot) => {
                      const projectLot = projectLots.get(lot.lot_id)
                      return (
                        <LotTile
                          key={lot.lot_id}
                          lot={lot}
                          canHide={
                            projectLot !== undefined &&
                            projectLot.active_transaction_count === 0
                          }
                          isHiding={setHiddenMutation.isPending}
                          onHide={() =>
                            projectLot && void setHidden(projectLot, true)
                          }
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        )
      })()}

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
