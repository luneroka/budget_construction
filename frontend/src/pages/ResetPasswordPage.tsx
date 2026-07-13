import { type FormEvent, useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { resetPassword } from '@/api/auth'
import { getApiErrorMessage } from '@/api/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { notifyError, notifySuccess } from '@/lib/toasts'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isPasswordConfirmationVisible, setIsPasswordConfirmationVisible] =
    useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!token) {
      const message = 'Le lien de réinitialisation est invalide ou a expiré.'
      setErrorMessage(message)
      notifyError(message)
      return
    }

    if (password !== passwordConfirmation) {
      const message = 'Les mots de passe ne correspondent pas.'
      setErrorMessage(message)
      notifyError(message)
      return
    }

    setIsSubmitting(true)

    try {
      await resetPassword({ token, new_password: password })
      const message = 'Votre mot de passe a été réinitialisé.'
      setSuccessMessage(message)
      setPassword('')
      setPasswordConfirmation('')
      notifySuccess(message)
    } catch (error) {
      const message = getApiErrorMessage(error)
      setErrorMessage(message)
      notifyError(`Réinitialisation impossible. ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-sm font-medium text-gold">Bâti Budget</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
            Nouveau mot de passe
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Définissez un nouveau mot de passe pour accéder à votre espace.
          </p>
        </div>

        <form
          className="rounded-lg border border-border bg-card p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                isVisible={isPasswordVisible}
                onVisibilityChange={setIsPasswordVisible}
                minLength={8}
                required
                disabled={Boolean(successMessage)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password-confirmation">
                Confirmer le mot de passe
              </Label>
              <PasswordInput
                id="new-password-confirmation"
                autoComplete="new-password"
                value={passwordConfirmation}
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)
                }
                isVisible={isPasswordConfirmationVisible}
                onVisibilityChange={setIsPasswordConfirmationVisible}
                minLength={8}
                required
                disabled={Boolean(successMessage)}
              />
            </div>

            {errorMessage ? (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div
                className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
                role="status"
              >
                {successMessage}
              </div>
            ) : null}

            {successMessage ? (
              <Link
                to="/login"
                className={buttonVariants({
                  variant: 'gold',
                  className: 'w-full',
                })}
              >
                <LogIn aria-hidden />
                Se connecter
              </Link>
            ) : (
              <Button
                type="submit"
                variant="gold"
                className="w-full"
                disabled={isSubmitting}
              >
                <KeyRound aria-hidden />
                {isSubmitting
                  ? 'Réinitialisation...'
                  : 'Réinitialiser le mot de passe'}
              </Button>
            )}
          </div>
        </form>
      </section>
    </main>
  )
}
