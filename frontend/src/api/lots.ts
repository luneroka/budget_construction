import { useMutation, useQuery } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type {
  GlobalLotRead,
  GlobalLotUpdate,
  LotCreate,
  ProjectLotRead,
  SupplierLotRead,
} from './types'

export const lotQueryKeys = {
  all: ['lots'] as const,
  project: (projectId: number) =>
    [...lotQueryKeys.all, 'project', projectId] as const,
  supplierLots: (projectId: number) =>
    [...lotQueryKeys.all, 'project', projectId, 'suppliers'] as const,
  global: () => [...lotQueryKeys.all, 'global'] as const,
}

export function getProjectLots(projectId: number): Promise<ProjectLotRead[]> {
  return apiGet<ProjectLotRead[]>(`/projects/${projectId}/lots/`)
}

export function createProjectLot(
  projectId: number,
  lot: LotCreate,
): Promise<ProjectLotRead> {
  return apiPost<ProjectLotRead, LotCreate>(`/projects/${projectId}/lots/`, lot)
}

export function setLotHidden(
  projectId: number,
  lotId: number,
  isHidden: boolean,
): Promise<ProjectLotRead> {
  return apiPatch<ProjectLotRead, { is_hidden: boolean }>(
    `/projects/${projectId}/lots/${lotId}`,
    { is_hidden: isHidden },
  )
}

export function getSupplierLots(projectId: number): Promise<SupplierLotRead[]> {
  return apiGet<SupplierLotRead[]>(`/projects/${projectId}/supplier-lots/`)
}

export function assignSupplierLot(
  projectId: number,
  supplierId: number,
  lotId: number,
): Promise<SupplierLotRead> {
  return apiPost<SupplierLotRead, { supplier_id: number; lot_id: number }>(
    `/projects/${projectId}/supplier-lots/`,
    { supplier_id: supplierId, lot_id: lotId },
  )
}

export function unassignSupplierLot(
  projectId: number,
  supplierId: number,
  lotId: number,
): Promise<void> {
  return apiDelete<void>(
    `/projects/${projectId}/supplier-lots/${supplierId}/${lotId}`,
  )
}

export function getGlobalLots(): Promise<GlobalLotRead[]> {
  return apiGet<GlobalLotRead[]>('/admin/lots/')
}

export function updateGlobalLot(
  lotId: number,
  lot: GlobalLotUpdate,
): Promise<GlobalLotRead> {
  return apiPatch<GlobalLotRead, GlobalLotUpdate>(`/admin/lots/${lotId}`, lot)
}

export function moveGlobalLot(
  lotId: number,
  direction: 'up' | 'down',
): Promise<GlobalLotRead[]> {
  return apiPost<GlobalLotRead[], { direction: 'up' | 'down' }>(
    `/admin/lots/${lotId}/move`,
    { direction },
  )
}

export function useProjectLotsQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [...lotQueryKeys.all, 'missing-project']
        : lotQueryKeys.project(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getProjectLots(projectId)
    },
    enabled: projectId !== null && (options?.enabled ?? true),
  })
}

export function useSupplierLotsQuery(
  projectId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey:
      projectId === null
        ? [...lotQueryKeys.all, 'missing-project', 'suppliers']
        : lotQueryKeys.supplierLots(projectId),
    queryFn: () => {
      if (projectId === null) {
        throw new Error('Identifiant projet manquant.')
      }

      return getSupplierLots(projectId)
    },
    enabled: projectId !== null && (options?.enabled ?? true),
  })
}

export function useGlobalLotsQuery(options: { enabled: boolean }) {
  return useQuery({
    queryKey: lotQueryKeys.global(),
    queryFn: getGlobalLots,
    enabled: options.enabled,
  })
}

export function useCreateProjectLotMutation() {
  return useMutation({
    mutationFn: ({ projectId, lot }: { projectId: number; lot: LotCreate }) =>
      createProjectLot(projectId, lot),
  })
}

export function useSetLotHiddenMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      lotId,
      isHidden,
    }: {
      projectId: number
      lotId: number
      isHidden: boolean
    }) => setLotHidden(projectId, lotId, isHidden),
  })
}

export function useAssignSupplierLotMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      supplierId,
      lotId,
    }: {
      projectId: number
      supplierId: number
      lotId: number
    }) => assignSupplierLot(projectId, supplierId, lotId),
  })
}

export function useUnassignSupplierLotMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      supplierId,
      lotId,
    }: {
      projectId: number
      supplierId: number
      lotId: number
    }) => unassignSupplierLot(projectId, supplierId, lotId),
  })
}

export function useUpdateGlobalLotMutation() {
  return useMutation({
    mutationFn: ({ lotId, lot }: { lotId: number; lot: GlobalLotUpdate }) =>
      updateGlobalLot(lotId, lot),
  })
}

export function useMoveGlobalLotMutation() {
  return useMutation({
    mutationFn: ({
      lotId,
      direction,
    }: {
      lotId: number
      direction: 'up' | 'down'
    }) => moveGlobalLot(lotId, direction),
  })
}
