import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { getApiErrorMessage } from '@/api/client'
import {
  projectQueryKeys,
  useCreateProjectFromTemplateMutation,
} from '@/api/projects'
import { useTemplatesQuery } from '@/api/templates'
import type { ProjectFromTemplateCreate, ProjectRead } from '@/api/types'

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
  const templatesQuery = useTemplatesQuery({ enabled: true })
  const createProjectMutation = useCreateProjectFromTemplateMutation()
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

  async function submit(project: ProjectFromTemplateCreate) {
    const generatedProject = await createProjectMutation.mutateAsync(project)

    queryClient.setQueryData<ProjectRead[]>(
      projectQueryKeys.list(false),
      (current) => {
        const existingProjects = current ?? []
        const withoutCreatedProject = existingProjects.filter(
          (existingProject) => existingProject.id !== generatedProject.project.id,
        )

        return [...withoutCreatedProject, generatedProject.project].sort((a, b) =>
          a.name.localeCompare(b.name),
        )
      },
    )

    setSelectedProjectId(String(generatedProject.project.id))
    setIsOpen(false)
    onProjectCreated?.()
    navigate('/budget')
  }

  return {
    canClose,
    close,
    createError: createProjectMutation.isError
      ? getApiErrorMessage(createProjectMutation.error)
      : null,
    isCreating: createProjectMutation.isPending,
    isLoadingTemplates: templatesQuery.isLoading || templatesQuery.isFetching,
    isOpen,
    open,
    submit,
    templates: templatesQuery.data ?? [],
    templatesError: templatesQuery.isError
      ? getApiErrorMessage(templatesQuery.error)
      : null,
  }
}
