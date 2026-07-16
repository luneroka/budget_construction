import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BarChart3,
  Copy,
  FolderPlus,
  Loader2,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import { documentQueryKeys, useDocumentsQuery } from '@/api/documents'
import {
  projectQueryKeys,
  useDeleteProjectMutation,
  useProjectFinancialSummaryQuery,
  useProjectQuery,
  useProjectsQuery,
  useUpdateProjectMutation,
} from '@/api/projects'
import { supplierQueryKeys } from '@/api/suppliers'
import { useTemplatesQuery } from '@/api/templates'
import type { ProjectRead, ProjectStatus, ProjectUpdate } from '@/api/types'
import { budgetLineQueryKeys } from '@/api/budget-lines'
import {
  transactionQueryKeys,
  useProjectTransactionsQuery,
} from '@/api/transactions'
import { trashQueryKeys } from '@/api/trash'
import { ProjectOnboardingDialog } from '@/components/layout/ProjectOnboardingDialog'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { SettingsBackButton } from '@/components/shared/SettingsBackButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useProjectOnboarding } from '@/hooks/useProjectOnboarding'
import { formatProjectStatus } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { useAppState } from '@/state/appState'

type ProjectFormState = {
  name: string
  description: string
  location: string
  startDate: string
  endDate: string
  status: ProjectStatus
}

const statusOptions: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'active', label: 'Actif' },
  { value: 'completed', label: 'Terminé' },
  { value: 'archived', label: 'Archivé' },
]

function formFromProject(project: ProjectRead): ProjectFormState {
  return {
    name: project.name,
    description: project.description ?? '',
    location: project.location ?? '',
    startDate: project.start_date ?? '',
    endDate: project.end_date ?? '',
    status: project.project_status,
  }
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function toProjectUpdate(form: ProjectFormState): ProjectUpdate {
  return {
    name: form.name.trim(),
    description: normalizeOptional(form.description),
    location: normalizeOptional(form.location),
    start_date: form.startDate || null,
    end_date: form.endDate || null,
    project_status: form.status,
  }
}

function isSameProjectUpdate(project: ProjectRead, update: ProjectUpdate) {
  return (
    project.name === update.name &&
    (project.description ?? null) === update.description &&
    (project.location ?? null) === update.location &&
    (project.start_date ?? null) === update.start_date &&
    (project.end_date ?? null) === update.end_date &&
    project.project_status === update.project_status
  )
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value > 1 ? plural : singular}`
}

export function ProjectsSettingsPage() {
  const queryClient = useQueryClient()
  const { selectedProjectId, setSelectedProjectId } = useAppState()
  const [selectedSettingsProjectId, setSelectedSettingsProjectId] = useState<
    number | null
  >(null)
  const projectsQuery = useProjectsQuery({ enabled: true })
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const activeProjectId = selectedSettingsProjectId
  const projectQuery = useProjectQuery(activeProjectId, { enabled: true })
  const financialSummaryQuery = useProjectFinancialSummaryQuery(
    activeProjectId,
    {
      enabled: true,
    },
  )
  const transactionsQuery = useProjectTransactionsQuery(activeProjectId, {
    enabled: true,
  })
  const documentsQuery = useDocumentsQuery({ enabled: true })
  const templatesQuery = useTemplatesQuery({ enabled: true })
  const updateProjectMutation = useUpdateProjectMutation()
  const deleteProjectMutation = useDeleteProjectMutation()
  const [form, setForm] = useState<ProjectFormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isEditingProjectInfo, setIsEditingProjectInfo] = useState(false)

  useEffect(() => {
    if (
      selectedSettingsProjectId !== null &&
      !projects.some((project) => project.id === selectedSettingsProjectId)
    ) {
      setSelectedSettingsProjectId(null)
    }
  }, [projects, selectedSettingsProjectId])

  useEffect(() => {
    if (!projectQuery.data) return

    setForm(formFromProject(projectQuery.data))
    setFormError(null)
    setIsEditingProjectInfo(false)
  }, [projectQuery.data])

  const projectOnboarding = useProjectOnboarding({
    projectCount: projects.length,
    projectsLoaded: projectsQuery.isSuccess,
    selectedProjectId,
    setSelectedProjectId,
  })

  const currentProject = projectQuery.data ?? null
  const currentTemplate = useMemo(
    () =>
      templatesQuery.data?.find(
        (template) => template.id === currentProject?.template_id,
      ) ?? null,
    [currentProject?.template_id, templatesQuery.data],
  )

  const projectUpdate = form ? toProjectUpdate(form) : null
  const hasChanges =
    Boolean(currentProject && projectUpdate) &&
    !isSameProjectUpdate(
      currentProject as ProjectRead,
      projectUpdate as ProjectUpdate,
    )
  const financialSummary = financialSummaryQuery.data
  const categoriesCount = useMemo(() => {
    const categoryNames = new Set(
      financialSummary?.products.map((product) => product.category_name) ?? [],
    )
    return categoryNames.size
  }, [financialSummary])
  const productsCount = financialSummary?.products.length ?? 0
  const budgetLinesCount =
    financialSummary?.products.reduce(
      (count, product) => count + product.budget_lines.length,
      0,
    ) ?? 0
  const transactionsCount = transactionsQuery.data?.length ?? 0
  const suppliersCount = useMemo(() => {
    const supplierIds = new Set(
      transactionsQuery.data
        ?.map((transaction) => transaction.supplier_id)
        .filter((supplierId): supplierId is number => supplierId !== null) ??
        [],
    )
    return supplierIds.size
  }, [transactionsQuery.data])
  const documentsCount =
    documentsQuery.data?.filter(
      (document) =>
        document.type === 'document' && document.project_id === activeProjectId,
    ).length ?? 0
  const statsLoading =
    financialSummaryQuery.isLoading ||
    transactionsQuery.isLoading ||
    documentsQuery.isLoading

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!currentProject || !projectUpdate || !form) return

    if (!form.name.trim()) {
      setFormError('Le nom du projet est obligatoire.')
      return
    }

    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setFormError(
        'La date de fin doit être postérieure ou égale à la date de début.',
      )
      return
    }

    try {
      setFormError(null)
      const updatedProject = await updateProjectMutation.mutateAsync({
        projectId: currentProject.id,
        project: projectUpdate,
      })

      queryClient.setQueryData<ProjectRead[]>(
        projectQueryKeys.list(false),
        (current) =>
          (current ?? [])
            .map((project) =>
              project.id === updatedProject.id ? updatedProject : project,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
      )
      queryClient.setQueryData(
        projectQueryKeys.detail(updatedProject.id),
        updatedProject,
      )
      void queryClient.invalidateQueries({
        queryKey: projectQueryKeys.detail(updatedProject.id),
      })
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists() })
      setIsEditingProjectInfo(false)
      notifySuccess('Projet mis à jour.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setFormError(message)
      notifyError(`Impossible de mettre à jour le projet. ${message}`)
    }
  }

  function handleCancelEdit() {
    if (!currentProject) return

    setForm(formFromProject(currentProject))
    setFormError(null)
    setIsEditingProjectInfo(false)
  }

  async function handleDeleteProject() {
    if (!currentProject) return

    try {
      setDeleteError(null)
      await deleteProjectMutation.mutateAsync(currentProject.id)

      const nextProject = projects.find(
        (project) => project.id !== currentProject.id,
      )
      queryClient.setQueryData<ProjectRead[]>(
        projectQueryKeys.list(false),
        (current) =>
          (current ?? []).filter((project) => project.id !== currentProject.id),
      )
      setSelectedProjectId(nextProject ? String(nextProject.id) : '')
      setSelectedSettingsProjectId(null)
      setShowDeleteDialog(false)
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: budgetLineQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: supplierQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: trashQueryKeys.all })
      notifySuccess('Projet supprimé.')
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDeleteError(message)
      notifyError(`Impossible de supprimer le projet. ${message}`)
    }
  }

  return (
    <section>
      <SettingsBackButton />
      <PageHeader
        title="Projets"
        description="Visualisation et gestion des projets."
        actions={
          <Button variant="gold" onClick={projectOnboarding.open}>
            <FolderPlus aria-hidden />
            Ajouter un projet
          </Button>
        }
      />

      {projectsQuery.isLoading ? (
        <SectionCard title="Chargement" description="Récupération des projets.">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Chargement des projets
          </div>
        </SectionCard>
      ) : null}

      {projectsQuery.isError ? (
        <SectionCard title="Projets indisponibles">
          <p className="text-sm text-destructive">
            {getApiErrorMessage(projectsQuery.error)}
          </p>
        </SectionCard>
      ) : null}

      {!projectsQuery.isLoading && !projectsQuery.isError && !currentProject ? (
        <SectionCard title="Sélection du projet">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun projet n'est encore disponible.
            </p>
          ) : (
            <div className="grid gap-2">
              {projects.map((project) => {
                const isCurrentProject =
                  String(project.id) === selectedProjectId

                return (
                  <button
                    key={project.id}
                    type="button"
                    className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setSelectedSettingsProjectId(project.id)
                      setSelectedProjectId(String(project.id))
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {project.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {project.location || 'Localisation non renseignée'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {isCurrentProject ? (
                        <Badge variant="gold">Actuel</Badge>
                      ) : null}
                      <Badge variant="muted">
                        {formatProjectStatus(project.project_status)}
                      </Badge>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </SectionCard>
      ) : null}

      {currentProject && form ? (
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSettingsProjectId(null)}
            >
              <ArrowLeft aria-hidden />
              Tous les projets
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isEditingProjectInfo || updateProjectMutation.isPending}
              onClick={() => setIsEditingProjectInfo(true)}
            >
              <Pencil aria-hidden />
              Modifier
            </Button>
          </div>

          <SectionCard
            title="Informations du projet"
            description="Informations principales utilisées dans l'application."
          >
            <form className="grid gap-3" onSubmit={handleSave}>
              <div className="grid gap-3">
                <div className="project-settings-grid-two grid gap-2">
                  <div className="grid gap-1">
                    <Label
                      htmlFor="project-settings-name"
                      className="text-xs text-muted-foreground"
                    >
                      Nom du projet
                    </Label>
                    <Input
                      id="project-settings-name"
                      className="h-8"
                      value={form.name}
                      disabled={
                        !isEditingProjectInfo || updateProjectMutation.isPending
                      }
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, name: event.target.value }
                            : current,
                        )
                      }
                    />
                  </div>

                  <div className="grid gap-1">
                    <Label
                      htmlFor="project-settings-location"
                      className="text-xs text-muted-foreground"
                    >
                      Localisation
                    </Label>
                    <Input
                      id="project-settings-location"
                      className="h-8"
                      value={form.location}
                      disabled={
                        !isEditingProjectInfo || updateProjectMutation.isPending
                      }
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, location: event.target.value }
                            : current,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="project-settings-grid-three grid gap-2">
                  <div className="grid gap-1">
                    <Label
                      htmlFor="project-settings-status"
                      className="text-xs text-muted-foreground"
                    >
                      Statut
                    </Label>
                    <Select
                      id="project-settings-status"
                      className="h-8"
                      value={form.status}
                      disabled={
                        !isEditingProjectInfo || updateProjectMutation.isPending
                      }
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? {
                                ...current,
                                status: event.target.value as ProjectStatus,
                              }
                            : current,
                        )
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="grid gap-1">
                    <Label
                      htmlFor="project-settings-start-date"
                      className="text-xs text-muted-foreground"
                    >
                      Date de début
                    </Label>
                    <Input
                      id="project-settings-start-date"
                      type="date"
                      className="h-8"
                      value={form.startDate}
                      disabled={
                        !isEditingProjectInfo || updateProjectMutation.isPending
                      }
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, startDate: event.target.value }
                            : current,
                        )
                      }
                    />
                  </div>

                  <div className="grid gap-1">
                    <Label
                      htmlFor="project-settings-end-date"
                      className="text-xs text-muted-foreground"
                    >
                      Date de fin
                    </Label>
                    <Input
                      id="project-settings-end-date"
                      type="date"
                      className="h-8"
                      value={form.endDate}
                      disabled={
                        !isEditingProjectInfo || updateProjectMutation.isPending
                      }
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, endDate: event.target.value }
                            : current,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-1">
                  <Label
                    htmlFor="project-settings-description"
                    className="text-xs text-muted-foreground"
                  >
                    Description
                  </Label>
                  <Input
                    id="project-settings-description"
                    className="h-8"
                    value={form.description}
                    disabled={
                      !isEditingProjectInfo || updateProjectMutation.isPending
                    }
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, description: event.target.value }
                          : current,
                      )
                    }
                  />
                </div>
              </div>

              {formError ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              ) : null}

              {isEditingProjectInfo ? (
                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={updateProjectMutation.isPending}
                    onClick={handleCancelEdit}
                  >
                    Annuler
                  </Button>
                  {hasChanges ? (
                    <Button
                      type="submit"
                      size="sm"
                      disabled={updateProjectMutation.isPending}
                    >
                      {updateProjectMutation.isPending ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <Save aria-hidden />
                      )}
                      {updateProjectMutation.isPending
                        ? 'Enregistrement'
                        : 'Enregistrer'}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </form>
          </SectionCard>

          <SectionCard
            title="Modèle de budget"
            description="Modèle utilisé pour générer la structure initiale."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoItem
                label="Modèle actuel"
                value={
                  templatesQuery.isLoading
                    ? 'Chargement'
                    : (currentTemplate?.name ?? 'Aucun modèle')
                }
              />
              <InfoItem
                label="Produits générés"
                value={String(productsCount)}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Le changement de modèle après la création du projet n'est pas pris
              en charge dans la v1.
            </p>
          </SectionCard>

          <SectionCard
            title="Statistiques du projet"
            description="Vue compacte des données existantes du projet."
            icon={BarChart3}
          >
            {statsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Calcul des statistiques
              </div>
            ) : (
              <div className="project-settings-grid-three grid gap-3">
                <StatItem label="Catégories" value={categoriesCount} />
                <StatItem label="Produits" value={productsCount} />
                <StatItem label="Lignes de budget" value={budgetLinesCount} />
                <StatItem label="Transactions" value={transactionsCount} />
                <StatItem label="Fournisseurs" value={suppliersCount} />
                <StatItem label="Documents" value={documentsCount} />
              </div>
            )}
          </SectionCard>

          {/*
            Hidden until users are ready to understand the consequences of removal.
            Before exposing this again, add safeguards: soft-delete, recoverable
            projects, a clearer flow, and additional confirmation dialogs.
          */}
          {false ? (
            <SectionCard
              title="Zone de danger"
              description="Actions sensibles sur le projet actuel."
              icon={AlertTriangle}
            >
              <div className="project-settings-grid-three grid gap-3">
                <DangerAction
                  title="Archiver le projet"
                  description="Masquer le projet sans le supprimer."
                  disabled
                  icon={<Archive aria-hidden />}
                />
                <DangerAction
                  title="Dupliquer le projet"
                  description="Créer une copie complète du budget."
                  disabled
                  icon={<Copy aria-hidden />}
                />
                <div className="flex min-h-36 flex-col justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <div>
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                      <p className="font-medium">Supprimer le projet</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Le projet ainsi que toutes ses données seront supprimés.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 aria-hidden />
                    Supprimer
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      <ProjectOnboardingDialog
        open={projectOnboarding.isOpen}
        canClose={projectOnboarding.canClose}
        templates={projectOnboarding.templates}
        isLoadingTemplates={projectOnboarding.isLoadingTemplates}
        templatesError={projectOnboarding.templatesError}
        isCreating={projectOnboarding.isCreating}
        createError={projectOnboarding.createError}
        onClose={projectOnboarding.close}
        onSubmit={projectOnboarding.submit}
      />

      {false ? (
        showDeleteDialog && currentProject ? (
          <ConfirmationDialog
            title="Supprimer ce projet ?"
            description="Cette action supprime le projet ainsi que toutes ses données."
            error={deleteError}
            isPending={deleteProjectMutation.isPending}
            confirmLabel="Supprimer le projet"
            pendingLabel="Suppression..."
            onCancel={() => {
              if (deleteProjectMutation.isPending) return
              setShowDeleteDialog(false)
              setDeleteError(null)
            }}
            onConfirm={handleDeleteProject}
          >
            <p className="font-medium text-foreground">
              {currentProject?.name ?? ''}
            </p>
            <p className="mt-1 text-muted-foreground">
              {pluralize(productsCount, 'produit')} ·{' '}
              {pluralize(transactionsCount, 'transaction')}
            </p>
          </ConfirmationDialog>
        ) : null
      ) : null}
    </section>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold">{value}</p>
    </div>
  )
}

function DangerAction({
  title,
  description,
  disabled,
  icon,
}: {
  title: string
  description: string
  disabled?: boolean
  icon: ReactNode
}) {
  return (
    <div className="flex min-h-36 flex-col justify-between gap-3 rounded-md border border-border bg-background p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
          <p className="font-medium">{title}</p>
          {disabled ? <Badge variant="muted">Bientôt</Badge> : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={disabled}
      >
        Indisponible
      </Button>
    </div>
  )
}
