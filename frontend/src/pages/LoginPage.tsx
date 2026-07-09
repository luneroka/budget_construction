import { type FormEvent, useRef, useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { forgotPassword } from '@/api/auth'
import { getApiErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/authContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { notifyError, notifySuccess } from '@/lib/toasts'

type LocationState = {
  from?: {
    pathname?: string
    search?: string
    hash?: string
  }
}

function getRedirectTarget(state: LocationState | null) {
  const from = state?.from

  if (!from) {
    return '/dashboard'
  }

  return `${from.pathname ?? '/dashboard'}${from.search ?? ''}${from.hash ?? ''}`
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const emailInputRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRequestingReset, setIsRequestingReset] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setResetMessage(null)
    setIsSubmitting(true)

    try {
      await login({ email, password })
      notifySuccess('Connexion réussie.')
      navigate(getRedirectTarget(location.state as LocationState | null), {
        replace: true,
      })
    } catch (error) {
      const message = getApiErrorMessage(error)
      setErrorMessage(message)
      notifyError(`Connexion impossible. ${message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleForgotPassword() {
    setErrorMessage(null)
    setResetMessage(null)

    if (!emailInputRef.current?.reportValidity()) {
      return
    }

    setIsRequestingReset(true)

    try {
      await forgotPassword({ email })
      const message =
        'Si cet email existe, un lien de réinitialisation vient d’être envoyé.'
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
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-sm font-medium text-gold">Budget Construction</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
            Connexion
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Accédez à votre espace de pilotage de chantier.
          </p>
        </div>

        <form
          className="rounded-lg border border-border bg-card p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                ref={emailInputRef}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setResetMessage(null)
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                isVisible={isPasswordVisible}
                onVisibilityChange={setIsPasswordVisible}
                required
              />
            </div>

            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-accent"
              disabled={isSubmitting || isRequestingReset}
              onClick={handleForgotPassword}
            >
              <KeyRound aria-hidden />
              {isRequestingReset
                ? 'Envoi du lien...'
                : 'Mot de passe oublié ?'}
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

            <Button
              type="submit"
              variant="gold"
              className="w-full"
              disabled={isSubmitting || isRequestingReset}
            >
              <LogIn aria-hidden />
              {isSubmitting ? 'Connexion...' : 'Se connecter'}
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}
