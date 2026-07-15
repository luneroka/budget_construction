import { useMutation, useQuery } from '@tanstack/react-query'

import { apiConfig } from './config'
import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type {
  DashboardBudgetAlertsRead,
  DashboardCategoryBudgetActualRead,
  DashboardCategoryDistributionRead,
  DashboardFinancialOverviewRead,
  DashboardSpendingOverTimePointRead,
  DashboardSupplierDistributionRead,
  DashboardTransactionWidgetRead,
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
  dashboardFinancialOverview: (projectId: number) =>
    [
      ...projectQueryKeys.all,
      projectId,
      'dashboard',
      'financial-overview',
    ] as const,
  dashboardSpendingOverTime: (projectId: number) =>
    [
      ...projectQueryKeys.all,
      projectId,
      'dashboard',
      'charts',
      'spending-over-time',
    ] as const,
  dashboardBudgetVsActual: (projectId: number) =>
    [
      ...projectQueryKeys.all,
      projectId,
      'dashboard',
      'charts',
      'budget-vs-actual',
    ] as const,
  dashboardCategoryDistribution: (projectId: number) =>
    [
      ...projectQueryKeys.all,
      projectId,
      'dashboard',
      'charts',
      'category-distribution',
    ] as const,
  dashboardSupplierDistribution: (projectId: number) =>
    [
      ...projectQueryKeys.all,
      projectId,
      'dashboard',
      'charts',
      'supplier-distribution',
    ] as const,
  dashboardWidget: (projectId: number, widget: string) =>
    [
      ...projectQueryKeys.all,
      projectId,
      'dashboard',
      'widgets',
      widget,
    ] as const,
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

export function deleteProject(projectId: number): Promise<ProjectRead> {
  return apiDelete<ProjectRead>(`/projects/${projectId}`)
}

export function getProjectFinancialSummary(
  projectId: number,
): Promise<ProjectFinancialSummaryRead> {
  return apiGet<ProjectFinancialSummaryRead>(
    `/projects/${projectId}/financial-summary`,
  )
}

export function getProjectDashboardFinancialOverview(
  projectId: number,
): Promise<DashboardFinancialOverviewRead> {
  return apiGet<DashboardFinancialOverviewRead>(
    `/projects/${projectId}/dashboard/financial-overview`,
  )
}

export function getProjectDashboardSpendingOverTime(
  projectId: number,
): Promise<DashboardSpendingOverTimePointRead[]> {
  return apiGet<DashboardSpendingOverTimePointRead[]>(
    `/projects/${projectId}/dashboard/charts/spending-over-time`,
  )
}

export function getProjectDashboardBudgetVsActual(
  projectId: number,
): Promise<DashboardCategoryBudgetActualRead[]> {
  return apiGet<DashboardCategoryBudgetActualRead[]>(
    `/projects/${projectId}/dashboard/charts/budget-vs-actual`,
  )
}

export function getProjectDashboardCategoryDistribution(
  projectId: number,
): Promise<DashboardCategoryDistributionRead[]> {
  return apiGet<DashboardCategoryDistributionRead[]>(
    `/projects/${projectId}/dashboard/charts/category-distribution`,
  )
}

export function getProjectDashboardSupplierDistribution(
  projectId: number,
): Promise<DashboardSupplierDistributionRead[]> {
  return apiGet<DashboardSupplierDistributionRead[]>(
    `/projects/${projectId}/dashboard/charts/supplier-distribution`,
  )
}

export function getProjectDashboardUnpaidInvoices(
  projectId: number,
): Promise<DashboardTransactionWidgetRead> {
  return apiGet<DashboardTransactionWidgetRead>(
    `/projects/${projectId}/dashboard/widgets/unpaid-invoices`,
  )
}

export function getProjectDashboardQuotesToConfirm(
  projectId: number,
): Promise<DashboardTransactionWidgetRead> {
  return apiGet<DashboardTransactionWidgetRead>(
    `/projects/${projectId}/dashboard/widgets/quotes-to-confirm`,
  )
}

export function getProjectDashboardQuotesToNegotiate(
  projectId: number,
): Promise<DashboardTransactionWidgetRead> {
  return apiGet<DashboardTransactionWidgetRead>(
    `/projects/${projectId}/dashboard/widgets/quotes-to-negotiate`,
  )
}

export function getProjectDashboardBudgetToValidate(
  projectId: number,
): Promise<DashboardTransactionWidgetRead> {
  return apiGet<DashboardTransactionWidgetRead>(
    `/projects/${projectId}/dashboard/widgets/budget-to-validate`,
  )
}

export function getProjectDashboardMissingDocuments(
  projectId: number,
): Promise<DashboardTransactionWidgetRead> {
  return apiGet<DashboardTransactionWidgetRead>(
    `/projects/${projectId}/dashboard/widgets/missing-documents`,
  )
}

export function getProjectDashboardRecentTransactions(
  projectId: number,
): Promise<DashboardTransactionWidgetRead> {
  return apiGet<DashboardTransactionWidgetRead>(
    `/projects/${projectId}/dashboard/widgets/recent-transactions`,
  )
}

export function getProjectDashboardBudgetAlerts(
  projectId: number,
): Promise<DashboardBudgetAlertsRead> {
  return apiGet<DashboardBudgetAlertsRead>(
    `/projects/${projectId}/dashboard/widgets/budget-alerts`,
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

export function useProjectDashboardFinancialOverviewQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [
            ...projectQueryKeys.all,
            'missing-project',
            'dashboard',
            'financial-overview',
          ]
        : projectQueryKeys.dashboardFinancialOverview(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectDashboardFinancialOverview(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useProjectDashboardSpendingOverTimeQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [
            ...projectQueryKeys.all,
            'missing-project',
            'dashboard',
            'charts',
            'spending-over-time',
          ]
        : projectQueryKeys.dashboardSpendingOverTime(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectDashboardSpendingOverTime(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useProjectDashboardBudgetVsActualQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [
            ...projectQueryKeys.all,
            'missing-project',
            'dashboard',
            'charts',
            'budget-vs-actual',
          ]
        : projectQueryKeys.dashboardBudgetVsActual(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectDashboardBudgetVsActual(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useProjectDashboardCategoryDistributionQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [
            ...projectQueryKeys.all,
            'missing-project',
            'dashboard',
            'charts',
            'category-distribution',
          ]
        : projectQueryKeys.dashboardCategoryDistribution(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectDashboardCategoryDistribution(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useProjectDashboardSupplierDistributionQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [
            ...projectQueryKeys.all,
            'missing-project',
            'dashboard',
            'charts',
            'supplier-distribution',
          ]
        : projectQueryKeys.dashboardSupplierDistribution(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectDashboardSupplierDistribution(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

function useProjectDashboardTransactionWidgetQuery(
  projectId: number | null,
  widget: string,
  queryFn: (projectId: number) => Promise<DashboardTransactionWidgetRead>,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [
            ...projectQueryKeys.all,
            'missing-project',
            'dashboard',
            'widgets',
            widget,
          ]
        : projectQueryKeys.dashboardWidget(projectId, widget),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return queryFn(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useProjectDashboardUnpaidInvoicesQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useProjectDashboardTransactionWidgetQuery(
    projectId,
    'unpaid-invoices',
    getProjectDashboardUnpaidInvoices,
    options,
  )
}

export function useProjectDashboardQuotesToConfirmQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useProjectDashboardTransactionWidgetQuery(
    projectId,
    'quotes-to-confirm',
    getProjectDashboardQuotesToConfirm,
    options,
  )
}

export function useProjectDashboardQuotesToNegotiateQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useProjectDashboardTransactionWidgetQuery(
    projectId,
    'quotes-to-negotiate',
    getProjectDashboardQuotesToNegotiate,
    options,
  )
}

export function useProjectDashboardBudgetToValidateQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useProjectDashboardTransactionWidgetQuery(
    projectId,
    'budget-to-validate',
    getProjectDashboardBudgetToValidate,
    options,
  )
}

export function useProjectDashboardMissingDocumentsQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useProjectDashboardTransactionWidgetQuery(
    projectId,
    'missing-documents',
    getProjectDashboardMissingDocuments,
    options,
  )
}

export function useProjectDashboardRecentTransactionsQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useProjectDashboardTransactionWidgetQuery(
    projectId,
    'recent-transactions',
    getProjectDashboardRecentTransactions,
    options,
  )
}

export function useProjectDashboardBudgetAlertsQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [
            ...projectQueryKeys.all,
            'missing-project',
            'dashboard',
            'widgets',
            'budget-alerts',
          ]
        : projectQueryKeys.dashboardWidget(projectId, 'budget-alerts'),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectDashboardBudgetAlerts(projectId)
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

export function useDeleteProjectMutation() {
  return useMutation({
    mutationFn: deleteProject,
  })
}
