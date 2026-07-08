import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Check, ChevronDown, FolderPlus, Loader2, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { getApiErrorMessage } from '@/api/client'
import {
  useProjectFinancialSummaryQuery,
  useProjectsQuery,
} from '@/api/projects'
import type { ProjectRead } from '@/api/types'
import type { ProjectViewModel } from '@/demo/types'
import { Button } from '@/components/ui/button'
import { useProjectOnboarding } from '@/hooks/useProjectOnboarding'
import { formatCurrency } from '@/lib/format'
import { useAppState } from '@/state/appState'
import { ProjectOnboardingDialog } from './ProjectOnboardingDialog'

function toProjectViewModel(project: ProjectRead): ProjectViewModel {
  return {
    id: String(project.id),
    user_id: String(project.user_id),
    template_id: project.template_id ?? 0,
    name: project.name,
    description: project.description ?? '',
    location: project.location ?? '',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    project_status: project.project_status,
    selected_budget_amount_ttc: 0,
  }
}

export function ProjectSwitcher() {
  const { selectedProjectId, setSelectedProjectId } = useAppState()
  const projectsQuery = useProjectsQuery({ enabled: true })
  const [isProjectListOpen, setIsProjectListOpen] = useState(false)
  const projects = useMemo(() => {
    if (projectsQuery.data) {
      return projectsQuery.data.map(toProjectViewModel)
    }

    return []
  }, [projectsQuery.data])

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  )
  const selectedProjectNumericId = selectedProject
    ? Number(selectedProject.id)
    : null
  const selectedProjectSummaryQuery = useProjectFinancialSummaryQuery(
    Number.isInteger(selectedProjectNumericId) ? selectedProjectNumericId : null,
    { enabled: true },
  )
  const selectedBudgetAmount = selectedProjectSummaryQuery.data
    ? Number(selectedProjectSummaryQuery.data.selected_budget_amount_ttc)
    : (selectedProject?.selected_budget_amount_ttc ?? 0)

  useEffect(() => {
    if (selectedProject && selectedProject.id !== selectedProjectId) {
      setSelectedProjectId(selectedProject.id)
    }
  }, [selectedProject, selectedProjectId, setSelectedProjectId])

  const projectOnboarding = useProjectOnboarding({
    projectCount: projects.length,
    projectsLoaded: projectsQuery.isSuccess,
    selectedProjectId,
    setSelectedProjectId,
    onProjectCreated: () => setIsProjectListOpen(false),
  })
  const onboardingDialog = (
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
  )

  if (projectsQuery.isLoading || projectsQuery.isFetching) {
    return (
      <div className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/35 px-3 py-3 text-sm text-sidebar-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin text-gold" aria-hidden />
          Chargement des projets
        </div>
      </div>
    )
  }

  if (projectsQuery.isError) {
    return (
      <div className="border-b border-sidebar-border p-4">
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/35 px-3 py-3 text-sm text-sidebar-foreground/75">
          <p className="font-medium text-sidebar-foreground">
            Projets indisponibles
          </p>
          <p className="mt-1 text-xs text-sidebar-foreground/60">
            {getApiErrorMessage(projectsQuery.error)}
          </p>
        </div>
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="border-b border-sidebar-border p-4">
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/35 px-3 py-3">
          <p className="text-xs font-medium text-sidebar-foreground/55">
            Projet actif
          </p>
          <p className="mt-1 text-sm font-semibold text-sidebar-foreground">
            Aucun projet
          </p>
          <p className="mt-1 text-xs text-sidebar-foreground/60">
            Créez un premier projet pour initialiser le budget.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3 w-full"
            onClick={projectOnboarding.open}
          >
            <FolderPlus aria-hidden />
            Nouveau projet
          </Button>
        </div>
        {onboardingDialog}
      </div>
    )
  }

  return (
    <div className="border-b border-sidebar-border p-4">
      <button
        type="button"
        className="w-full rounded-md border border-sidebar-border bg-sidebar-accent/35 px-3 py-3 text-left transition-colors hover:bg-sidebar-accent/55"
        onClick={() => setIsProjectListOpen((isOpen) => !isOpen)}
        aria-expanded={isProjectListOpen}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-xs font-medium text-sidebar-foreground/55">
              Projet actif
            </span>
            <span className="mt-1 block truncate text-sm font-semibold text-sidebar-foreground">
              {selectedProject.name}
            </span>
            <span className="mt-1 block truncate text-xs text-sidebar-foreground/60">
              {selectedProject.location}
            </span>
            <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-sidebar-foreground/70">
              <span>
                Budget : {formatCurrency(selectedBudgetAmount)}
              </span>
            </span>
          </span>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-gold transition-transform ${
              isProjectListOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </span>
      </button>

      {isProjectListOpen ? (
        <div className="mt-3 overflow-hidden rounded-md border border-sidebar-border bg-sidebar-accent/20 shadow-sm">
          <div className="py-1">
            {projects.map((project) => (
              <ProjectMenuItem
                key={project.id}
                label={project.name}
                icon={
                  project.id === selectedProjectId ? (
                    <Check className="h-4 w-4 stroke-[1.8]" aria-hidden="true" />
                  ) : null
                }
                onClick={() => {
                  setSelectedProjectId(project.id)
                  setIsProjectListOpen(false)
                }}
              />
            ))}
          </div>

          <div className="border-t border-sidebar-border" />

          <ProjectMenuItem
            icon={
              <FolderPlus
                className="h-4 w-4 stroke-[1.8]"
                aria-hidden="true"
              />
            }
            label="Nouveau projet"
            onClick={() => {
              projectOnboarding.open()
              setIsProjectListOpen(false)
            }}
          />

          <div className="border-t border-sidebar-border" />

          <ProjectMenuLink
            icon={
              <Settings className="h-4 w-4 stroke-[1.8]" aria-hidden="true" />
            }
            label="Gérer les projets"
            to="/settings/projects"
            onClick={() => {
              setIsProjectListOpen(false)
            }}
          />
        </div>
      ) : null}

      {onboardingDialog}
    </div>
  )
}

type ProjectMenuItemProps = {
  label: string
  icon?: ReactNode
  onClick: () => void
}

function ProjectMenuItem({
  label,
  icon,
  onClick,
}: ProjectMenuItemProps) {
  return (
    <button
      type="button"
      className="flex h-10 w-full items-center gap-3 px-3 text-left font-body text-sm font-normal leading-5 text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      onClick={onClick}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gold">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate font-body text-sm font-normal leading-5">
        {label}
      </span>
    </button>
  )
}

type ProjectMenuLinkProps = ProjectMenuItemProps & {
  to: string
}

function ProjectMenuLink({
  label,
  icon,
  onClick,
  to,
}: ProjectMenuLinkProps) {
  return (
    <Link
      to={to}
      className="flex h-10 w-full items-center gap-3 px-3 text-left font-body text-sm font-normal leading-5 text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      onClick={onClick}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gold">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate font-body text-sm font-normal leading-5">
        {label}
      </span>
    </Link>
  )
}
