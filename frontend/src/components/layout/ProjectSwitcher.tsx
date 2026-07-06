import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, FolderPlus, Settings } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { useProjectsQuery } from '@/api/projects'
import type { ProjectRead } from '@/api/types'
import { projectViewModels } from '@/demo/demo-data'
import type { ProjectViewModel } from '@/demo/types'
import { formatCurrency, formatProjectStatus } from '@/lib/format'
import { useAppState } from '@/state/appState'

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
  const navigate = useNavigate()
  const { selectedProjectId, setSelectedProjectId } = useAppState()
  const projectsQuery = useProjectsQuery()
  const [isProjectListOpen, setIsProjectListOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const projects = useMemo(() => {
    if (projectsQuery.data && projectsQuery.data.length > 0) {
      return projectsQuery.data.map(toProjectViewModel)
    }

    return projectViewModels
  }, [projectsQuery.data])

  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  )

  useEffect(() => {
    if (selectedProject && selectedProject.id !== selectedProjectId) {
      setSelectedProjectId(selectedProject.id)
    }
  }, [selectedProject, selectedProjectId, setSelectedProjectId])

  if (!selectedProject) {
    return null
  }

  const createProjectModal = isCreateModalOpen
    ? createPortal(
        <div className="fixed inset-0 z-1000 flex items-center justify-center bg-foreground/45 px-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-foreground shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold">
                <FolderPlus className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-heading text-xl font-semibold">
                  Nouveau projet
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Placeholder pour la création de projet. Le formulaire complet
                  sera raccordé ultérieurement.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

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
              <span>{formatProjectStatus(selectedProject.project_status)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {formatCurrency(selectedProject.selected_budget_amount_ttc)}
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
              setIsCreateModalOpen(true)
              setIsProjectListOpen(false)
            }}
          />

          <div className="border-t border-sidebar-border" />

          <ProjectMenuItem
            icon={
              <Settings className="h-4 w-4 stroke-[1.8]" aria-hidden="true" />
            }
            label="Gérer les projets"
            onClick={() => {
              setIsProjectListOpen(false)
              navigate('/settings/projects')
            }}
          />
        </div>
      ) : null}

      {createProjectModal}
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
