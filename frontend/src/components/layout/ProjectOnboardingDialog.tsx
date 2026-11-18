import { type FormEvent, useEffect, useState } from 'react'
import { AlertCircle, FolderPlus, Loader2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import type { ProjectCreate } from '@/api/types'
import { useDiscardConfirmation } from '@/components/shared/useDiscardConfirmation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ProjectOnboardingDialogProps = {
  open: boolean
  canClose: boolean
  isCreating: boolean
  createError: string | null
  onClose: () => void
  onSubmit: (project: ProjectCreate) => Promise<void>
}

type FormState = {
  name: string
  description: string
  location: string
}

const initialForm: FormState = {
  name: '',
  description: '',
  location: '',
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function ProjectOnboardingDialog({
  open,
  canClose,
  isCreating,
  createError,
  onClose,
  onSubmit,
}: ProjectOnboardingDialogProps) {
  const [form, setForm] = useState<FormState>(initialForm)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setForm(initialForm)
      setFormError(null)
    }
  }, [open])

  const { confirmDiscard, discardDialog } = useDiscardConfirmation(
    [form.name, form.description, form.location].some(
      (value) => value.trim() !== '',
    ),
  )

  if (!open) {
    return null
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = form.name.trim()

    if (!name) {
      setFormError('Le nom du projet est obligatoire.')
      return
    }

    setFormError(null)

    try {
      await onSubmit({
        name,
        description: normalizeOptional(form.description),
        location: normalizeOptional(form.location),
      })
    } catch {
      // The mutation error is rendered from createError.
    }
  }

  const errorMessage = formError ?? createError

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-4 py-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-onboarding-title"
      >
        <form
          className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-xl"
          onSubmit={submitProject}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gold/15 text-gold">
                <FolderPlus className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Nouveau projet
                </p>
                <h2
                  id="project-onboarding-title"
                  className="font-heading text-xl font-semibold"
                >
                  Initialiser un projet de construction
                </h2>
              </div>
            </div>

            {canClose ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Fermer"
                disabled={isCreating}
                onClick={() => confirmDiscard(onClose)}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>

          <div className="overflow-y-auto px-5 py-5">
            <div className="grid gap-5">
              <section className="grid gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Informations principales du projet
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Le projet démarre avec tous les lots. Les détails avancés
                    pourront être complétés plus tard.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="project-name">Nom du projet</Label>
                    <Input
                      id="project-name"
                      value={form.name}
                      placeholder="Maison familiale"
                      autoComplete="off"
                      disabled={isCreating}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="project-description">Description</Label>
                    <Textarea
                      id="project-description"
                      value={form.description}
                      placeholder="Décrire l'objectif et le périmètre du projet..."
                      disabled={isCreating}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="project-location">Localisation</Label>
                    <Input
                      id="project-location"
                      value={form.location}
                      placeholder="Ville ou adresse"
                      autoComplete="off"
                      disabled={isCreating}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          location: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </section>

              {errorMessage ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            {canClose ? (
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                onClick={() => confirmDiscard(onClose)}
              >
                Annuler
              </Button>
            ) : null}
            <Button type="submit" disabled={isCreating}>
              {isCreating ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <FolderPlus aria-hidden />
              )}
              {isCreating ? 'Initialisation' : 'Créer le projet'}
            </Button>
          </div>
        </form>
      </div>
      {discardDialog}
    </>,
    document.body,
  )
}
