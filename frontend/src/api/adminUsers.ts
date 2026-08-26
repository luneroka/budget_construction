import { useMutation, useQuery } from '@tanstack/react-query'

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { AdminUserCreate, AdminUserRead, AdminUserUpdate } from './types'

export const adminUserQueryKeys = {
  all: ['admin', 'users'] as const,
  list: (includeDeleted = false) =>
    [...adminUserQueryKeys.all, 'list', { includeDeleted }] as const,
}

export function getAdminUsers(
  includeDeleted = false,
): Promise<AdminUserRead[]> {
  return apiGet<AdminUserRead[]>('/admin/users/', {
    params: { include_deleted: includeDeleted },
  })
}

// Creates the account and emails the person a link to choose their password.
export function inviteUser(user: AdminUserCreate): Promise<AdminUserRead> {
  return apiPost<AdminUserRead, AdminUserCreate>('/admin/users/', user)
}

export function updateAdminUser(
  userId: number,
  user: AdminUserUpdate,
): Promise<AdminUserRead> {
  return apiPatch<AdminUserRead, AdminUserUpdate>(
    `/admin/users/${userId}`,
    user,
  )
}

export function deleteAdminUser(userId: number): Promise<AdminUserRead> {
  return apiDelete<AdminUserRead>(`/admin/users/${userId}`)
}

export function restoreAdminUser(userId: number): Promise<AdminUserRead> {
  return apiPost<AdminUserRead, undefined>(
    `/admin/users/${userId}/restore`,
    undefined,
  )
}

export function useAdminUsersQuery(options: {
  enabled: boolean
  includeDeleted?: boolean
}) {
  const includeDeleted = options.includeDeleted ?? false
  return useQuery({
    queryKey: adminUserQueryKeys.list(includeDeleted),
    queryFn: () => getAdminUsers(includeDeleted),
    enabled: options.enabled,
  })
}

export function useInviteUserMutation() {
  return useMutation({ mutationFn: inviteUser })
}

export function useUpdateAdminUserMutation() {
  return useMutation({
    mutationFn: ({ userId, user }: { userId: number; user: AdminUserUpdate }) =>
      updateAdminUser(userId, user),
  })
}

export function useDeleteAdminUserMutation() {
  return useMutation({ mutationFn: deleteAdminUser })
}

export function useRestoreAdminUserMutation() {
  return useMutation({ mutationFn: restoreAdminUser })
}
