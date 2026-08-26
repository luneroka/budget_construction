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

type UserStatus = {
  label: string
  variant: 'success' | 'warning' | 'muted'
}

function statusOf(user: AdminUserRead): UserStatus {
  if (user.deleted_at) return { label: 'Supprimé', variant: 'muted' }
  if (!user.is_active) return { label: 'Désactivé', variant: 'warning' }
  return { label: 'Actif', variant: 'success' }
}

type UserActionsProps = {
  user: AdminUserRead
  isSelf: boolean
  disabled: boolean
  onToggleActive: (user: AdminUserRead) => void
  onDelete: (user: AdminUserRead) => void
  onRestore: (user: AdminUserRead) => void
}

function UserActions({
  user,
  isSelf,
  disabled,
  onToggleActive,
  onDelete,
  onRestore,
}: UserActionsProps) {
  if (isSelf) {
    return (
      <span className="text-xs text-muted-foreground">
        Gérez votre compte depuis « Paramètres utilisateur ».
      </span>
    )
  }

  if (user.deleted_at) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onRestore(user)}
      >
        <RotateCcw aria-hidden />
        Restaurer
      </Button>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onToggleActive(user)}
      >
        {user.is_active ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
        {user.is_active ? 'Désactiver' : 'Réactiver'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => onDelete(user)}
      >
        <Trash2 aria-hidden />
        Supprimer
      </Button>
    </>
  )
}

function UserName({ user, isSelf }: { user: AdminUserRead; isSelf: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-medium text-foreground">{user.name}</span>
      {user.is_admin ? (
        <Badge variant="gold">
          <ShieldCheck className="mr-1 h-3 w-3" aria-hidden />
          Admin
        </Badge>
      ) : null}
      {isSelf ? (
        <span className="text-xs text-muted-foreground">(vous)</span>
      ) : null}
    </span>
  )
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

  function requestDelete(user: AdminUserRead) {
    setDeleteError(null)
    setUserToDelete(user)
  }

  const users = usersQuery.data ?? []
  const isBusy =
    updateMutation.isPending ||
    deleteMutation.isPending ||
    restoreMutation.isPending

  const actionProps = {
    disabled: isBusy,
    onToggleActive: handleToggleActive,
    onDelete: requestDelete,
    onRestore: handleRestore,
  }

  return (
    <section>
      <SettingsBackButton />
      <PageHeader
        title="Utilisateurs"
        description="Invitez des utilisateurs et gérez l'accès à l'application. Il n'y a pas d'inscription publique."
      />

      <div className="space-y-4">
        <SectionCard
          title="Inviter un utilisateur"
          description="Un e-mail avec un lien pour choisir son mot de passe lui sera envoyé."
          icon={MailPlus}
        >
          <form className="space-y-4" onSubmit={handleInvite}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
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
              <Button
                type="submit"
                variant="gold"
                className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
                disabled={inviteMutation.isPending}
              >
                {inviteMutation.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <MailPlus aria-hidden />
                )}
                {inviteMutation.isPending ? 'Envoi...' : "Envoyer l'invitation"}
              </Button>
            </div>

            {inviteError ? (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {inviteError}
              </div>
            ) : null}
          </form>
        </SectionCard>

        <SectionCard
          title="Comptes"
          description="Désactiver un compte bloque la connexion sans rien effacer. Supprimer un compte place ses données à la corbeille."
          icon={Users}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label
              htmlFor="include-deleted-users"
              className="inline-flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id="include-deleted-users"
                checked={includeDeleted}
                onChange={(event) => setIncludeDeleted(event.target.checked)}
              />
              Afficher les comptes supprimés
            </label>
            {usersQuery.data ? (
              <span className="text-sm text-muted-foreground">
                {users.length} compte{users.length > 1 ? 's' : ''}
              </span>
            ) : null}
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
            <>
              {/* Phones and small tablets: one card per account. */}
              <ul className="space-y-3 md:hidden">
                {users.map((user) => {
                  const status = statusOf(user)
                  const isSelf = user.id === currentUser?.id

                  return (
                    <li
                      key={user.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <UserName user={user} isSelf={isSelf} />
                          <p className="truncate text-sm text-muted-foreground">
                            {user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Créé le {formatDate(user.created_at)}
                          </p>
                        </div>
                        <Badge variant={status.variant} className="shrink-0">
                          {status.label}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <UserActions
                          user={user}
                          isSelf={isSelf}
                          {...actionProps}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Larger screens: a table; the date column only when there is room. */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Créé le
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const status = statusOf(user)
                      const isSelf = user.id === currentUser?.id

                      return (
                        <TableRow key={user.id}>
                          <TableCell>
                            <UserName user={user} isSelf={isSelf} />
                          </TableCell>
                          <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                            {user.email}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">
                            {formatDate(user.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <UserActions
                                user={user}
                                isSelf={isSelf}
                                {...actionProps}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
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
