import { useMutation, useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiGet, apiPatch, apiPost } from './client'
import type {
  GeneratedProjectRead,
  ProjectFinancialSummaryRead,
  ProjectFromTemplateCreate,
  ProjectRead,
  ProjectUpdate,
} from './types'

export const projectQueryKeys = {
  all: ['projects'] as const,
  lists: () => [...projectQueryKeys.all, 'list'] as const,
  list: (includeDeleted = false) =>
    [...projectQueryKeys.lists(), { includeDeleted }] as const,
  detail: (projectId: number, includeDeleted = false) =>
    [...projectQueryKeys.all, projectId, 'detail', { includeDeleted }] as const,
  financialSummary: (projectId: number) =>
    [...projectQueryKeys.all, projectId, 'financial-summary'] as const,
}

export function getProjects(includeDeleted = false): Promise<ProjectRead[]> {
  return apiGet<ProjectRead[]>('/projects/', {
    params: { include_deleted: includeDeleted },
  })
}

export function getProject(
  projectId: number,
  includeDeleted = false,
): Promise<ProjectRead> {
  return apiGet<ProjectRead>(`/projects/${projectId}`, {
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

export function updateProject(
  projectId: number,
  project: ProjectUpdate,
): Promise<ProjectRead> {
  return apiPatch<ProjectRead, ProjectUpdate>(`/projects/${projectId}`, project)
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

export function useProjectQuery(
  projectId: number | null,
  options?: { enabled?: boolean; includeDeleted?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [...projectQueryKeys.all, 'missing-project', 'detail']
        : projectQueryKeys.detail(projectId, options?.includeDeleted ?? false),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProject(projectId, options?.includeDeleted ?? false)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
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
        throw new Error('Identifiant projet manquant.')
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

export function useUpdateProjectMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      project,
    }: {
      projectId: number
      project: ProjectUpdate
    }) => updateProject(projectId, project),
  })
}
