import { useMutation, useQuery } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import { apiConfig } from './config'
import type {
  BudgetLineCreate,
  BudgetLineRead,
  BudgetLineUpdate,
  ProductLineConvertToBreakdown,
} from './types'

export const budgetLineQueryKeys = {
  all: ['budget-lines'] as const,
  project: (projectId: number) =>
    [...budgetLineQueryKeys.all, 'project', projectId] as const,
  projectList: (projectId: number) =>
    [...budgetLineQueryKeys.project(projectId), 'list'] as const,
  detail: (projectId: number, budgetLineId: number) =>
    [
      ...budgetLineQueryKeys.project(projectId),
      budgetLineId,
      'detail',
    ] as const,
}

export function getBudgetLines(projectId: number): Promise<BudgetLineRead[]> {
  return apiGet<BudgetLineRead[]>(`/projects/${projectId}/budget-lines/`)
}

export function getBudgetLine(
  projectId: number,
  budgetLineId: number,
): Promise<BudgetLineRead> {
  return apiGet<BudgetLineRead>(
    `/projects/${projectId}/budget-lines/${budgetLineId}`,
  )
}

export function createBudgetLine(
  projectId: number,
  budgetLine: BudgetLineCreate,
): Promise<BudgetLineRead> {
  return apiPost<BudgetLineRead, BudgetLineCreate>(
    `/projects/${projectId}/budget-lines/`,
    budgetLine,
  )
}

export function loadBudgetLinesFromTemplate(
  projectId: number,
  templateId: number,
): Promise<BudgetLineRead[]> {
  return apiPost<BudgetLineRead[], undefined>(
    `/projects/${projectId}/budget-lines/from-template/${templateId}`,
    undefined,
  )
}

export function updateBudgetLine(
  projectId: number,
  budgetLineId: number,
  budgetLine: BudgetLineUpdate,
): Promise<BudgetLineRead> {
  return apiPatch<BudgetLineRead, BudgetLineUpdate>(
    `/projects/${projectId}/budget-lines/${budgetLineId}`,
    budgetLine,
  )
}

export function deleteBudgetLine(
  projectId: number,
  budgetLineId: number,
): Promise<BudgetLineRead> {
  return apiDelete<BudgetLineRead>(
    `/projects/${projectId}/budget-lines/${budgetLineId}`,
  )
}

export function convertProductLineToBreakdown(
  projectId: number,
  productId: number,
  conversion: ProductLineConvertToBreakdown,
): Promise<BudgetLineRead[]> {
  return apiPost<BudgetLineRead[], ProductLineConvertToBreakdown>(
    `/projects/${projectId}/products/${productId}/budget-lines/convert-to-breakdown`,
    conversion,
  )
}

export function useBudgetLinesQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [...budgetLineQueryKeys.all, 'missing-project', 'list']
        : budgetLineQueryKeys.projectList(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getBudgetLines(projectId)
    },
    enabled:
      projectId !== null && (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useBudgetLineQuery(
  projectId: number | null,
  budgetLineId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null || budgetLineId === null
        ? [...budgetLineQueryKeys.all, 'missing-budget-line', 'detail']
        : budgetLineQueryKeys.detail(projectId, budgetLineId),
    queryFn: () => {
      if (projectId === null || budgetLineId === null) {
        throw new Error('Identifiant projet ou poste de budget manquant.')
      }

      return getBudgetLine(projectId, budgetLineId)
    },
    enabled:
      projectId !== null &&
      budgetLineId !== null &&
      (options?.enabled ?? apiConfig.enableReadQueries),
  })
}

export function useCreateBudgetLineMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLine,
    }: {
      projectId: number
      budgetLine: BudgetLineCreate
    }) => createBudgetLine(projectId, budgetLine),
  })
}

export function useLoadBudgetLinesFromTemplateMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      templateId,
    }: {
      projectId: number
      templateId: number
    }) => loadBudgetLinesFromTemplate(projectId, templateId),
  })
}

export function useUpdateBudgetLineMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLineId,
      budgetLine,
    }: {
      projectId: number
      budgetLineId: number
      budgetLine: BudgetLineUpdate
    }) => updateBudgetLine(projectId, budgetLineId, budgetLine),
  })
}

export function useDeleteBudgetLineMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      budgetLineId,
    }: {
      projectId: number
      budgetLineId: number
    }) => deleteBudgetLine(projectId, budgetLineId),
  })
}

export function useConvertProductLineToBreakdownMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      productId,
      conversion,
    }: {
      projectId: number
      productId: number
      conversion: ProductLineConvertToBreakdown
    }) => convertProductLineToBreakdown(projectId, productId, conversion),
  })
}
