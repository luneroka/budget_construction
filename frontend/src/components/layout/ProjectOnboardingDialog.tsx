import { type FormEvent, useEffect, useState } from 'react'
import { AlertCircle, Check, FolderPlus, Loader2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

import type { ProjectFromTemplateCreate, TemplateRead } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ProjectOnboardingDialogProps = {
  open: boolean
  canClose: boolean
  templates: TemplateRead[]
  isLoadingTemplates: boolean
  templatesError: string | null
  isCreating: boolean
  createError: string | null
  onClose: () => void
  onSubmit: (project: ProjectFromTemplateCreate) => Promise<void>
}

type FormState = {
  name: string
  description: string
  location: string
  templateId: string
}

const initialForm: FormState = {
  name: '',
  description: '',
  location: '',
  templateId: '',
}

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function ProjectOnboardingDialog({
  open,
  canClose,
  templates,
  isLoadingTemplates,
  templatesError,
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

  useEffect(() => {
    if (form.templateId || templates.length === 0) return

    setForm((current) => ({
      ...current,
      templateId: String(templates[0].id),
    }))
  }, [form.templateId, templates])

  if (!open) {
    return null
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = form.name.trim()
    const templateId = Number(form.templateId)

    if (!name) {
      setFormError('Le nom du projet est obligatoire.')
      return
    }

    if (!Number.isInteger(templateId) || templateId <= 0) {
      setFormError('Sélectionnez un modèle de budget.')
      return
    }

    setFormError(null)

    try {
      await onSubmit({
        name,
        template_id: templateId,
        description: normalizeOptional(form.description),
        location: normalizeOptional(form.location),
      })
    } catch {
      // The mutation error is rendered from createError.
    }
  }

  const errorMessage = formError ?? createError ?? templatesError
  const hasTemplates = templates.length > 0
  const disableSubmit = isCreating || isLoadingTemplates || !hasTemplates

  return createPortal(
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
              onClick={onClose}
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
                  Les détails avancés pourront être complétés plus tard.
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
                    className="min-h-20"
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

            <section className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold">Modèle de budget</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Les éléments qui composent le budget seront automatiquement
                  ajoutés à partir du modèle sélectionné.
                </p>
              </div>

              {isLoadingTemplates ? (
                <div className="flex items-center gap-2 rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Chargement des modèles
                </div>
              ) : null}

              {!isLoadingTemplates && !hasTemplates ? (
                <div className="rounded-md border border-border px-3 py-3 text-sm text-muted-foreground">
                  Aucun modèle actif n'est disponible.
                </div>
              ) : null}

              {hasTemplates ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {templates.map((template) => {
                    const templateId = String(template.id)
                    const isSelected = form.templateId === templateId

                    return (
                      <label
                        key={template.id}
                        className={`relative flex min-h-28 cursor-pointer flex-col rounded-md border px-3 py-3 transition-colors ${
                          isSelected
                            ? 'border-accent bg-accent/5'
                            : 'border-border bg-background hover:bg-muted/60'
                        } ${isCreating ? 'cursor-not-allowed opacity-70' : ''}`}
                      >
                        <input
                          type="radio"
                          name="templateId"
                          value={templateId}
                          checked={isSelected}
                          disabled={isCreating}
                          className="sr-only"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              templateId: event.target.value,
                            }))
                          }
                        />
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-medium">{template.name}</span>
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? 'border-accent bg-accent text-accent-foreground'
                                : 'border-border'
                            }`}
                          >
                            {isSelected ? (
                              <Check className="h-3 w-3" aria-hidden />
                            ) : null}
                          </span>
                        </span>
                        <span className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                          {template.description ?? 'Modèle de budget actif'}
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : null}
            </section>

            {errorMessage ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
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
              onClick={onClose}
            >
              Annuler
            </Button>
          ) : null}
          <Button type="submit" disabled={disableSubmit}>
            {isCreating ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <FolderPlus aria-hidden />
            )}
            {isCreating ? 'Initialisation' : 'Créer le projet'}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
