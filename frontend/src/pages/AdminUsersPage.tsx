import { type FormEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  MailPlus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { Navigate } from 'react-router-dom'

import {
  adminUserQueryKeys,
  useAdminUsersQuery,
  useDeleteAdminUserMutation,
  useInviteUserMutation,
  useRestoreAdminUserMutation,
  useUpdateAdminUserMutation,
} from '@/api/adminUsers'
import { getApiErrorMessage } from '@/api/client'
import type { AdminUserRead } from '@/api/types'
import { useAuth } from '@/auth/authContext'
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { SettingsBackButton } from '@/components/shared/SettingsBackButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { notifyError, notifySuccess } from '@/lib/toasts'

function statusOf(user: AdminUserRead): {
  label: string
  variant: 'success' | 'warning' | 'muted'
} {
  if (user.deleted_at) return { label: 'Supprimé', variant: 'muted' }
  if (!user.is_active) return { label: 'Désactivé', variant: 'warning' }
  return { label: 'Actif', variant: 'success' }
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = currentUser?.is_admin ?? false

  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [userToDelete, setUserToDelete] = useState<AdminUserRead | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const usersQuery = useAdminUsersQuery({ enabled: isAdmin, includeDeleted })
  const inviteMutation = useInviteUserMutation()
  const updateMutation = useUpdateAdminUserMutation()
  const deleteMutation = useDeleteAdminUserMutation()
  const restoreMutation = useRestoreAdminUserMutation()

  if (currentUser && !isAdmin) {
    return <Navigate to="/settings" replace />
  }

  async function refreshUsers() {
    await queryClient.invalidateQueries({ queryKey: adminUserQueryKeys.all })
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInviteError(null)

    try {
      const created = await inviteMutation.mutateAsync({
        name: inviteName.trim(),
        email: inviteEmail.trim(),
      })
      notifySuccess(
        `Invitation envoyée à ${created.email}. La personne choisira son mot de passe via le lien reçu.`,
      )
      setInviteName('')
      setInviteEmail('')
      await refreshUsers()
    } catch (error) {
      const message = getApiErrorMessage(error)
      setInviteError(message)
      notifyError(`Invitation impossible. ${message}`)
    }
  }

  async function handleToggleActive(user: AdminUserRead) {
    const nextActive = !user.is_active
    try {
      await updateMutation.mutateAsync({
        userId: user.id,
        user: { is_active: nextActive },
      })
      notifySuccess(
        nextActive
          ? `${user.name} peut de nouveau se connecter.`
          : `${user.name} ne peut plus se connecter.`,
      )
      await refreshUsers()
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    }
  }

  async function handleConfirmDelete() {
    if (!userToDelete) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(userToDelete.id)
      notifySuccess(
        `${userToDelete.name} a été supprimé. Ses projets sont conservés et restaurables.`,
      )
      setUserToDelete(null)
      await refreshUsers()
    } catch (error) {
      const message = getApiErrorMessage(error)
      setDeleteError(message)
      notifyError(message)
    }
  }

  async function handleRestore(user: AdminUserRead) {
    try {
      await restoreMutation.mutateAsync(user.id)
      notifySuccess(`${user.name} a été restauré.`)
      await refreshUsers()
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    }
  }

  const users = usersQuery.data ?? []
  const isBusy =
    updateMutation.isPending ||
    deleteMutation.isPending ||
    restoreMutation.isPending

  return (
    <section>
      <SettingsBackButton />
      <PageHeader
        title="Utilisateurs"
        description="Invitez des utilisateurs et gérez l'accès à l'application. Il n'y a pas d'inscription publique."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <SectionCard
          title="Inviter un utilisateur"
          description="Un e-mail avec un lien pour choisir son mot de passe lui sera envoyé."
          icon={MailPlus}
        >
          <form className="space-y-4" onSubmit={handleInvite}>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Nom</Label>
              <Input
                id="invite-name"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                autoComplete="off"
                required
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                autoComplete="off"
                required
              />
            </div>

            {inviteError ? (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {inviteError}
              </div>
            ) : null}

            <Button
              type="submit"
              variant="gold"
              className="w-full"
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <MailPlus aria-hidden />
              )}
              {inviteMutation.isPending ? 'Envoi...' : "Envoyer l'invitation"}
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title="Comptes"
          description="Désactiver un compte bloque la connexion sans rien effacer. Supprimer un compte place ses données à la corbeille."
          icon={Users}
        >
          <div className="mb-4 flex items-center gap-2">
            <Checkbox
              id="include-deleted-users"
              checked={includeDeleted}
              onChange={(event) => setIncludeDeleted(event.target.checked)}
            />
            <Label htmlFor="include-deleted-users" className="font-normal">
              Afficher les comptes supprimés
            </Label>
          </div>

          {usersQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : usersQuery.isError ? (
            <p className="text-sm text-destructive">
              {getApiErrorMessage(usersQuery.error)}
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun utilisateur.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Créé le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const status = statusOf(user)
                  const isSelf = user.id === currentUser?.id
                  const isDeleted = user.deleted_at !== null

                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          {user.name}
                          {user.is_admin ? (
                            <Badge variant="gold">
                              <ShieldCheck
                                className="mr-1 h-3 w-3"
                                aria-hidden
                              />
                              Admin
                            </Badge>
                          ) : null}
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">
                              (vous)
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {isSelf ? null : isDeleted ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleRestore(user)}
                            >
                              <RotateCcw aria-hidden />
                              Restaurer
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => handleToggleActive(user)}
                              >
                                {user.is_active ? (
                                  <UserX aria-hidden />
                                ) : (
                                  <UserCheck aria-hidden />
                                )}
                                {user.is_active ? 'Désactiver' : 'Réactiver'}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={isBusy}
                                onClick={() => {
                                  setDeleteError(null)
                                  setUserToDelete(user)
                                }}
                              >
                                <Trash2 aria-hidden />
                                Supprimer
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>

      {userToDelete ? (
        <ConfirmationDialog
          title={`Supprimer ${userToDelete.name} ?`}
          description={`Le compte ${userToDelete.email} ne pourra plus se connecter. Ses projets, transactions et documents sont placés à la corbeille et restent restaurables depuis cette page.`}
          error={deleteError}
          isPending={deleteMutation.isPending}
          onCancel={() => setUserToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </section>
  )
}
