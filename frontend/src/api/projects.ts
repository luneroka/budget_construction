import { useMutation, useQuery } from '@tanstack/react-query'

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

type ProjectQueryOptions = { enabled?: boolean }

// Every project-scoped read has the same shape: a key derived from the project
// id, a fetcher that needs it, and "disabled while no project is selected".
function useProjectScopedQuery<TData>(
  projectId: number | null,
  queryKey: (projectId: number) => readonly unknown[],
  queryFn: (projectId: number) => Promise<TData>,
  options?: ProjectQueryOptions,
) {
  return useQuery({
    queryKey:
      projectId === null
        ? ([...projectQueryKeys.all, 'missing-project'] as const)
        : queryKey(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return queryFn(projectId)
    },
    enabled: projectId !== null && (options?.enabled ?? true),
  })
}

export function useProjectsQuery(options?: ProjectQueryOptions) {
  return useQuery({
    queryKey: projectQueryKeys.list(false),
    queryFn: () => getProjects(false),
    enabled: options?.enabled ?? true,
  })
}

export function useProjectQuery(
  projectId: number | null,
  options?: ProjectQueryOptions & { includeDeleted?: boolean },
) {
  const includeDeleted = options?.includeDeleted ?? false
  return useProjectScopedQuery(
    projectId,
    (id) => projectQueryKeys.detail(id, includeDeleted),
    (id) => getProject(id, includeDeleted),
    options,
  )
}

export function useProjectFinancialSummaryQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectScopedQuery(
    projectId,
    projectQueryKeys.financialSummary,
    getProjectFinancialSummary,
    options,
  )
}

export function useProjectDashboardFinancialOverviewQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectScopedQuery(
    projectId,
    projectQueryKeys.dashboardFinancialOverview,
    getProjectDashboardFinancialOverview,
    options,
  )
}

export function useProjectDashboardSpendingOverTimeQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectScopedQuery(
    projectId,
    projectQueryKeys.dashboardSpendingOverTime,
    getProjectDashboardSpendingOverTime,
    options,
  )
}

export function useProjectDashboardBudgetVsActualQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectScopedQuery(
    projectId,
    projectQueryKeys.dashboardBudgetVsActual,
    getProjectDashboardBudgetVsActual,
    options,
  )
}

export function useProjectDashboardCategoryDistributionQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectScopedQuery(
    projectId,
    projectQueryKeys.dashboardCategoryDistribution,
    getProjectDashboardCategoryDistribution,
    options,
  )
}

export function useProjectDashboardSupplierDistributionQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectScopedQuery(
    projectId,
    projectQueryKeys.dashboardSupplierDistribution,
    getProjectDashboardSupplierDistribution,
    options,
  )
}

function useProjectDashboardWidgetQuery<TData>(
  projectId: number | null,
  widget: string,
  queryFn: (projectId: number) => Promise<TData>,
  options?: ProjectQueryOptions,
) {
  return useProjectScopedQuery(
    projectId,
    (id) => projectQueryKeys.dashboardWidget(id, widget),
    queryFn,
    options,
  )
}

export function useProjectDashboardUnpaidInvoicesQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectDashboardWidgetQuery(
    projectId,
    'unpaid-invoices',
    getProjectDashboardUnpaidInvoices,
    options,
  )
}

export function useProjectDashboardQuotesToConfirmQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectDashboardWidgetQuery(
    projectId,
    'quotes-to-confirm',
    getProjectDashboardQuotesToConfirm,
    options,
  )
}

export function useProjectDashboardQuotesToNegotiateQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectDashboardWidgetQuery(
    projectId,
    'quotes-to-negotiate',
    getProjectDashboardQuotesToNegotiate,
    options,
  )
}

export function useProjectDashboardBudgetToValidateQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectDashboardWidgetQuery(
    projectId,
    'budget-to-validate',
    getProjectDashboardBudgetToValidate,
    options,
  )
}

export function useProjectDashboardMissingDocumentsQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectDashboardWidgetQuery(
    projectId,
    'missing-documents',
    getProjectDashboardMissingDocuments,
    options,
  )
}

export function useProjectDashboardRecentTransactionsQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectDashboardWidgetQuery(
    projectId,
    'recent-transactions',
    getProjectDashboardRecentTransactions,
    options,
  )
}

export function useProjectDashboardBudgetAlertsQuery(
  projectId: number | null,
  options?: ProjectQueryOptions,
) {
  return useProjectDashboardWidgetQuery(
    projectId,
    'budget-alerts',
    getProjectDashboardBudgetAlerts,
    options,
  )
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
