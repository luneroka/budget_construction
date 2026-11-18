import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { getApiErrorMessage } from '@/api/client'
import { projectQueryKeys, useCreateProjectMutation } from '@/api/projects'
import type { ProjectCreate, ProjectRead } from '@/api/types'
import { notifyError, notifySuccess } from '@/lib/toasts'

type UseProjectOnboardingOptions = {
  projectCount: number
  projectsLoaded: boolean
  selectedProjectId: string
  setSelectedProjectId: (projectId: string) => void
  onProjectCreated?: () => void
}

export function useProjectOnboarding({
  projectCount,
  projectsLoaded,
  selectedProjectId,
  setSelectedProjectId,
  onProjectCreated,
}: UseProjectOnboardingOptions) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createProjectMutation = useCreateProjectMutation()
  const { reset: resetCreateProjectMutation } = createProjectMutation
  const [isOpen, setIsOpen] = useState(false)
  const canClose = projectCount > 0

  const open = useCallback(() => {
    resetCreateProjectMutation()
    setIsOpen(true)
  }, [resetCreateProjectMutation])

  const close = useCallback(() => {
    if (!canClose || createProjectMutation.isPending) return

    setIsOpen(false)
  }, [canClose, createProjectMutation.isPending])

  useEffect(() => {
    if (!projectsLoaded || projectCount > 0) return

    if (selectedProjectId) {
      setSelectedProjectId('')
    }

    setIsOpen(true)
  }, [projectCount, projectsLoaded, selectedProjectId, setSelectedProjectId])

  // A new project starts with every global lot; there is no template step.
  async function submit(project: ProjectCreate) {
    try {
      const createdProject = await createProjectMutation.mutateAsync(project)

      queryClient.setQueryData<ProjectRead[]>(
        projectQueryKeys.list(false),
        (current) => {
          const existingProjects = current ?? []
          const withoutCreatedProject = existingProjects.filter(
            (existingProject) => existingProject.id !== createdProject.id,
          )

          return [...withoutCreatedProject, createdProject].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
        },
      )

      setSelectedProjectId(String(createdProject.id))
      setIsOpen(false)
      onProjectCreated?.()
      notifySuccess('Projet créé.')
      navigate('/lots')
    } catch (error) {
      const message = getApiErrorMessage(error)
      notifyError(`Impossible de créer le projet. ${message}`)
      throw error
    }
  }

  return {
    canClose,
    close,
    createError: createProjectMutation.isError
      ? getApiErrorMessage(createProjectMutation.error)
      : null,
    isCreating: createProjectMutation.isPending,
    isOpen,
    open,
    submit,
  }
}
