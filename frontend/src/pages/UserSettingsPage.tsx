import { useState } from 'react'
import { KeyRound, Mail, UserCog } from 'lucide-react'

import { forgotPassword } from '@/api/auth'
import { getApiErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/authContext'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { SettingsBackButton } from '@/components/shared/SettingsBackButton'
import { Button } from '@/components/ui/button'
import { notifyError, notifySuccess } from '@/lib/toasts'

export function UserSettingsPage() {
  const { user } = useAuth()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [isRequestingReset, setIsRequestingReset] = useState(false)

  async function handlePasswordResetRequest() {
    if (!user) return

    setErrorMessage(null)
    setResetMessage(null)
    setIsRequestingReset(true)

    try {
      await forgotPassword({ email: user.email })
      const message =
        'Un lien de réinitialisation vient d’être envoyé à votre adresse email.'
      setResetMessage(message)
      notifySuccess(message)
    } catch (error) {
      const message = getApiErrorMessage(error)
      setErrorMessage(message)
      notifyError(`Réinitialisation impossible. ${message}`)
    } finally {
      setIsRequestingReset(false)
    }
  }

  return (
    <section>
      <SettingsBackButton />
      <PageHeader
        title="Paramètres utilisateur"
        description="Consultez les informations de votre compte et gérez votre mot de passe."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Compte"
          description="Informations associées à votre session."
          icon={UserCog}
        >
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-foreground">Nom</dt>
              <dd className="mt-1 text-muted-foreground">
                {user?.name ?? 'Utilisateur'}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Email</dt>
              <dd className="mt-1 flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" aria-hidden />
                {user?.email ?? 'Email indisponible'}
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard
          title="Mot de passe"
          description="Recevez un lien sécurisé pour définir un nouveau mot de passe."
          icon={KeyRound}
        >
          <div className="space-y-4">
            <Button
              type="button"
              variant="gold"
              disabled={!user || isRequestingReset}
              onClick={handlePasswordResetRequest}
            >
              <KeyRound aria-hidden />
              {isRequestingReset
                ? 'Envoi du lien...'
                : 'Envoyer le lien de réinitialisation'}
            </Button>

            {errorMessage ? (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            {resetMessage ? (
              <div
                className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
                role="status"
              >
                {resetMessage}
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </section>
  )
}
