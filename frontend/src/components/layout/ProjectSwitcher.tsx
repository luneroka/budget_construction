import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ChevronDown,
  Copy,
  FolderPlus,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'

import { formatCurrency, formatProjectStatus } from '@/lib/format'
import { mockProjects } from '@/lib/mock-data'

const STORAGE_KEY = 'budget-construction:selected-project-id'

type ProjectAction = 'create' | 'duplicate' | 'archive' | 'delete'

const projectActions: Array<{
  id: ProjectAction
  label: string
  icon: typeof FolderPlus
}> = [
  { id: 'create', label: 'Creer un projet', icon: FolderPlus },
  { id: 'duplicate', label: 'Dupliquer', icon: Copy },
  { id: 'archive', label: 'Archiver', icon: Archive },
  { id: 'delete', label: 'Supprimer', icon: Trash2 },
]

function getInitialProjectId() {
  if (typeof window === 'undefined') {
    return mockProjects[0]?.id ?? ''
  }

  const storedProjectId = window.localStorage.getItem(STORAGE_KEY)
  const storedProject = mockProjects.find(
    (project) => project.id === storedProjectId,
  )

  return storedProject?.id ?? mockProjects[0]?.id ?? ''
}

export function ProjectSwitcher() {
  const [selectedProjectId, setSelectedProjectId] =
    useState(getInitialProjectId)
  const [isProjectListOpen, setIsProjectListOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<ProjectAction | null>(null)

  const selectedProject = useMemo(
    () =>
      mockProjects.find((project) => project.id === selectedProjectId) ??
      mockProjects[0],
    [selectedProjectId],
  )

  useEffect(() => {
    if (selectedProjectId) {
      window.localStorage.setItem(STORAGE_KEY, selectedProjectId)
    }
  }, [selectedProjectId])

  if (!selectedProject) {
    return null
  }

  return (
    <div className="border-b border-sidebar-border p-4">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 rounded-md bg-sidebar-accent/60 p-3 text-left transition-colors hover:bg-sidebar-accent"
        onClick={() => setIsProjectListOpen((isOpen) => !isOpen)}
        aria-expanded={isProjectListOpen}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-sidebar-foreground">
            {selectedProject.name}
          </span>
          <span className="mt-1 block text-xs text-sidebar-foreground/65">
            {formatCurrency(selectedProject.selected_budget_amount_ttc)} ·{' '}
            {formatProjectStatus(selectedProject.project_status)}
          </span>
          <span className="mt-1 block truncate text-xs text-sidebar-foreground/45">
            {selectedProject.location}
          </span>
        </span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-gold transition-transform ${
            isProjectListOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isProjectListOpen ? (
        <div className="mt-3 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-2">
          <div className="space-y-1">
            {mockProjects.map((project) => (
              <button
                type="button"
                key={project.id}
                className={`w-full rounded-sm px-2 py-2 text-left transition-colors ${
                  project.id === selectedProjectId
                    ? 'bg-sidebar-accent text-gold'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                }`}
                onClick={() => {
                  setSelectedProjectId(project.id)
                  setIsProjectListOpen(false)
                }}
              >
                <span className="block truncate text-sm font-medium">
                  {project.name}
                </span>
                <span className="mt-0.5 block text-xs opacity-70">
                  {formatCurrency(project.selected_budget_amount_ttc)} ·{' '}
                  {formatProjectStatus(project.project_status)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-4 gap-1">
        {projectActions.map((action) => (
          <button
            type="button"
            key={action.id}
            className="flex h-9 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-gold"
            onClick={() => setActiveAction(action.id)}
            title={action.label}
            aria-label={action.label}
          >
            <action.icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
      </div>

      <button
        type="button"
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        onClick={() => setActiveAction('create')}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        Gerer les projets
      </button>

      {activeAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-foreground shadow-lg">
            <p className="font-heading text-xl font-semibold">
              Gestion de projet
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Action placeholder:{' '}
              {projectActions.find((action) => action.id === activeAction)
                ?.label ?? 'Gerer les projets'}
              . Les formulaires complets seront traites dans les chunks
              suivants.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                onClick={() => setActiveAction(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
