import { type FormEvent, useState } from 'react'
import { LogIn } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { getApiErrorMessage } from '@/api/client'
import { useAuth } from '@/auth/authContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await login({ email, password })
      navigate(getRedirectTarget(location.state as LocationState | null), {
        replace: true,
      })
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error))
    } finally {
      setIsSubmitting(false)
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
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
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

            <Button
              type="submit"
              variant="gold"
              className="w-full"
              disabled={isSubmitting}
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
