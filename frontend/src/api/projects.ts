import { useMutation, useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiGet, apiPost } from './client'
import type {
  GeneratedProjectRead,
  ProjectFinancialSummaryRead,
  ProjectFromTemplateCreate,
  ProjectRead,
} from './types'

export const projectQueryKeys = {
  all: ['projects'] as const,
  lists: () => [...projectQueryKeys.all, 'list'] as const,
  list: (includeDeleted = false) =>
    [...projectQueryKeys.lists(), { includeDeleted }] as const,
  financialSummary: (projectId: number) =>
    [...projectQueryKeys.all, projectId, 'financial-summary'] as const,
}

export function getProjects(includeDeleted = false): Promise<ProjectRead[]> {
  return apiGet<ProjectRead[]>('/projects/', {
    params: { include_deleted: includeDeleted },
  })
}

export function createProjectFromTemplate(
  project: ProjectFromTemplateCreate,
): Promise<GeneratedProjectRead> {
  return apiPost<GeneratedProjectRead, ProjectFromTemplateCreate>(
    '/projects/from-template',
    project,
  )
}

export function getProjectFinancialSummary(
  projectId: number,
): Promise<ProjectFinancialSummaryRead> {
  return apiGet<ProjectFinancialSummaryRead>(
    `/projects/${projectId}/financial-summary`,
  )
}

export function useProjectsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: projectQueryKeys.list(false),
    queryFn: () => getProjects(false),
    enabled: options?.enabled ?? apiConfig.enableReadQueries,
  })
}

export function useProjectFinancialSummaryQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [...projectQueryKeys.all, 'missing-project', 'financial-summary']
        : projectQueryKeys.financialSummary(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Project id is required')
      }

      return getProjectFinancialSummary(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useCreateProjectFromTemplateMutation() {
  return useMutation({
    mutationFn: createProjectFromTemplate,
  })
}
