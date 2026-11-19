import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { ArrowLeft, Check, Lock, Trash2, TriangleAlert } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import { useProjectLotsQuery, useSupplierLotsQuery } from '@/api/lots'
import { useProjectFinancialSummaryQuery } from '@/api/projects'
import { useSupplierQuery } from '@/api/suppliers'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  SupplierFormSection,
  SupplierFormSections,
} from '@/components/suppliers/SupplierForm'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Checkbox } from '@/components/ui/checkbox'
import { useSupplierActions } from '@/hooks/useSupplierActions'
import { useSupplierForm } from '@/hooks/useSupplierForm'
import { supplierToDomain } from '@/lib/apiAdapters'
import { visibleLots } from '@/lib/lots'
import { formToSupplier, validateSupplierForm } from '@/lib/supplierForm'
import {
  assignedLotIds,
  lockedLotIds,
  sameLotIds,
  supplierFormReturnPath,
} from '@/lib/supplierFormPage'
import { lotLabel } from '@/lib/transactionWorkspace'
import { useSelectedProjectId } from '@/state/appState'
import type { Supplier } from '@/types'

// The supplier form, as a page: /suppliers/new and /suppliers/:id/edit.
export function SupplierFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { supplierId: supplierIdParam } = useParams<{ supplierId: string }>()
  const parsedId = Number(supplierIdParam)
  const supplierId =
    mode === 'edit' && Number.isInteger(parsedId) && parsedId > 0
      ? parsedId
      : null
  const supplierQuery = useSupplierQuery(supplierId)
  const projectId = useSelectedProjectId()
  const lotsQuery = useProjectLotsQuery(projectId)
  const supplierLotsQuery = useSupplierLotsQuery(projectId)
  const summaryQuery = useProjectFinancialSummaryQuery(projectId)
  const fallback =
    mode === 'edit' && supplierId !== null
      ? `/suppliers/${supplierId}`
      : '/suppliers'
  const location = useLocation()
  const returnPath = supplierFormReturnPath(location.state, fallback)

  const title =
    mode === 'create' ? 'Nouveau fournisseur' : 'Modifier le fournisseur'
  const backLink = (
    <Link
      to={returnPath}
      className={buttonVariants({
        variant: 'ghost',
        size: 'sm',
        className: 'mb-4',
      })}
    >
      <ArrowLeft aria-hidden />
      Retour
    </Link>
  )

  const isLoading =
    supplierQuery.isLoading ||
    lotsQuery.isLoading ||
    supplierLotsQuery.isLoading ||
    summaryQuery.isLoading

  if (isLoading) {
    return (
      <section>
        {backLink}
        <PageHeader title={title} />
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </section>
    )
  }

  if (mode === 'edit' && (supplierQuery.isError || !supplierQuery.data)) {
    return (
      <section>
        <PageHeader title="Fournisseur introuvable" />
        <p className="text-sm text-muted-foreground">
          {supplierQuery.isError
            ? getApiErrorMessage(supplierQuery.error)
            : 'Ce fournisseur n’existe pas ou a été supprimé.'}
        </p>
        <Link
          to="/suppliers"
          className={buttonVariants({ variant: 'outline', className: 'mt-4' })}
        >
          <ArrowLeft aria-hidden />
          Retour aux fournisseurs
        </Link>
      </section>
    )
  }

  const supplier = supplierQuery.data
    ? supplierToDomain(supplierQuery.data)
    : null
  return (
    <SupplierFormBody
      // A fresh form for each supplier and project.
      key={`${supplier?.id ?? 'new'}-${projectId ?? 'none'}`}
      mode={mode}
      title={title}
      supplier={supplier}
      projectId={projectId}
      lots={visibleLots(lotsQuery.data)}
      initialLotIds={assignedLotIds(
        supplierLotsQuery.data,
        supplier?.id ?? null,
      )}
      // A lot where the supplier has active quotes or invoices stays ticked.
      lockedLots={lockedLotIds(summaryQuery.data, supplier?.id ?? null)}
      returnPath={returnPath}
      backLink={backLink}
    />
  )
}

function SupplierFormBody({
  mode,
  title,
  supplier,
  projectId,
  lots,
  initialLotIds,
  lockedLots,
  returnPath,
  backLink,
}: {
  mode: 'create' | 'edit'
  title: string
  supplier: Supplier | null
  projectId: number | null
  lots: ReturnType<typeof visibleLots>
  initialLotIds: number[]
  lockedLots: Set<number>
  returnPath: string
  backLink: ReactNode
}) {
  const navigate = useNavigate()
  const { saveSupplier, deleteSupplier } = useSupplierActions(projectId)
  const controls = useSupplierForm(supplier)
  const [initialLots] = useState(initialLotIds)
  const [lotIds, setLotIds] = useState<number[]>(initialLotIds)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const hasUnsavedChanges =
    controls.hasUnsavedChanges || !sameLotIds(lotIds, initialLots)
  const isBusy = isSaving || isDeleting
  // Set right before a save or a deletion leaves the page, so the guard
  // below lets that one navigation through.
  const isLeavingRef = useRef(false)

  // Leaving with edits asks first, whatever the way out: Annuler, Retour,
  // the sidebar, the browser's back button. A clean form leaves silently.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges &&
      !isLeavingRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  // A reload or a closed tab: the browser's own prompt.
  useEffect(() => {
    if (!hasUnsavedChanges) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  const lotsById = useMemo(() => new Set(lots.map((lot) => lot.id)), [lots])

  function toggleLot(lotId: number, checked: boolean) {
    setLotIds((current) =>
      checked
        ? [...current, lotId]
        : current.filter((candidate) => candidate !== lotId),
    )
  }

  function leave(path: string) {
    isLeavingRef.current = true
    navigate(path)
  }

  async function save() {
    const validationError = validateSupplierForm(controls.form)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      await saveSupplier(
        formToSupplier(controls.form, supplier),
        supplier?.id ?? null,
        projectId === null
          ? undefined
          : {
              project_id: projectId,
              lot_ids: lotIds.filter((lotId) => lotsById.has(lotId)),
            },
      )
      leave(returnPath)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Enregistrement impossible.',
      )
      setIsSaving(false)
    }
  }

  async function confirmDelete() {
    if (!supplier) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteSupplier(supplier)
      leave('/suppliers')
    } catch (error) {
      setDeleteError(getApiErrorMessage(error))
      setIsDeleting(false)
    }
  }

  return (
    <section data-blocks-auto-update={hasUnsavedChanges || undefined}>
      {backLink}
      <PageHeader
        title={title}
        description={supplier ? supplier.name : undefined}
      />

      <form
        className="max-w-5xl space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <SupplierFormSections controls={controls} disabled={isBusy} />

        <SupplierFormSection title="Lots du projet">
          {projectId === null ? (
            <p className="text-sm text-muted-foreground">
              Sélectionnez un projet pour choisir les lots de ce fournisseur.
            </p>
          ) : lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun lot visible dans ce projet.
            </p>
          ) : (
            <fieldset>
              <legend className="sr-only">Lots du projet</legend>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {lots.map((lot) => {
                  const isLocked = lockedLots.has(lot.id)
                  const inputId = `supplier-lot-${lot.id}`
                  return (
                    <label
                      key={lot.id}
                      htmlFor={inputId}
                      className="flex min-h-10 items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={inputId}
                        checked={lotIds.includes(lot.id)}
                        // Active quotes or invoices keep the lot ticked.
                        disabled={
                          isBusy || (isLocked && lotIds.includes(lot.id))
                        }
                        onChange={(event) =>
                          toggleLot(lot.id, event.target.checked)
                        }
                      />
                      <span className="min-w-0 truncate">{lotLabel(lot)}</span>
                      {isLocked ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden />
                          Devis ou factures
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}
        </SupplierFormSection>

        {formError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {formError}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {mode === 'edit' && supplier ? (
              <Button
                variant="destructiveOutline"
                disabled={isBusy}
                onClick={() => {
                  setDeleteError(null)
                  setIsConfirmingDelete(true)
                }}
              >
                <Trash2 aria-hidden />
                Supprimer le fournisseur
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={isBusy}
              onClick={() => navigate(returnPath)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="gold" disabled={isBusy}>
              <Check aria-hidden />
              {isSaving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </form>

      {blocker.state === 'blocked' ? (
        <ConfirmationDialog
          icon={<TriangleAlert className="h-5 w-5" aria-hidden="true" />}
          title="Abandonner les modifications ?"
          description="Elles n’ont pas été enregistrées et seront perdues."
          cancelLabel="Continuer l’édition"
          confirmLabel="Abandonner"
          onCancel={() => blocker.reset()}
          onConfirm={() => blocker.proceed()}
        />
      ) : null}

      {isConfirmingDelete && supplier ? (
        <ConfirmationDialog
          title="Supprimer ce fournisseur ?"
          description="Ce fournisseur sera déplacé dans la corbeille. Les transactions existantes ne seront pas supprimées."
          error={deleteError}
          isPending={isDeleting}
          onCancel={() => {
            if (isDeleting) return
            setIsConfirmingDelete(false)
            setDeleteError(null)
          }}
          onConfirm={() => void confirmDelete()}
        >
          <p className="font-medium text-foreground">{supplier.name}</p>
          <p className="mt-1 text-muted-foreground">
            {supplier.siret
              ? `SIRET / SIREN ${supplier.siret}`
              : 'Sans SIRET / SIREN'}
          </p>
        </ConfirmationDialog>
      ) : null}
    </section>
  )
}
