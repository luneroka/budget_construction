import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2 } from 'lucide-react'

import { invalidateBudgetWorkspaceQueries } from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import {
  useConvertProductLineToBreakdownMutation,
  useCreateBudgetLineMutation,
} from '@/api/budget-lines'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  ActiveAction,
  BreakdownAction,
  ProductStructureChoice,
} from '@/components/budget/types'
import { cn } from '@/lib/utils'

export function ProductStructureDialog({
  activeAction,
  projectId,
  selectedStructureChoice,
  onSelectStructureChoice,
  onContinue,
  onClose,
}: {
  activeAction: Exclude<ActiveAction, { kind: 'transaction' }>
  projectId: number
  selectedStructureChoice: ProductStructureChoice
  onSelectStructureChoice: (choice: ProductStructureChoice) => void
  onContinue: (action: BreakdownAction) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const createBudgetLineMutation = useCreateBudgetLineMutation()
  const convertProductLineMutation = useConvertProductLineToBreakdownMutation()
  const [breakdownName, setBreakdownName] = useState('')
  const [existingLineName, setExistingLineName] = useState(
    activeAction.product.product_name,
  )
  const [newBreakdownNames, setNewBreakdownNames] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isMutating =
    createBudgetLineMutation.isPending || convertProductLineMutation.isPending
  const productId = Number(activeAction.product.product_id)

  function parseBreakdownNames(value: string) {
    return value
      .split(/\n|,/)
      .map((name) => name.trim())
      .filter(Boolean)
  }

  async function submitAddBreakdown() {
    if (!Number.isInteger(productId)) {
      setError('Identifiant produit invalide.')
      return
    }

    try {
      setError(null)
      await createBudgetLineMutation.mutateAsync({
        projectId,
        budgetLine: {
          product_id: productId,
          item_type: 'breakdown',
          name: breakdownName,
        },
      })
      invalidateBudgetWorkspaceQueries(queryClient, projectId)
      onClose()
    } catch (mutationError) {
      setError(getApiErrorMessage(mutationError))
    }
  }

  async function submitConvertProduct() {
    if (!Number.isInteger(productId)) {
      setError('Identifiant produit invalide.')
      return
    }

    try {
      setError(null)
      await convertProductLineMutation.mutateAsync({
        projectId,
        productId,
        conversion: {
          strategy: 'reuse_existing_as_breakdown',
          existing_line_new_name: existingLineName,
          new_breakdown_names: parseBreakdownNames(newBreakdownNames),
        },
      })
      invalidateBudgetWorkspaceQueries(queryClient, projectId)
      onClose()
    } catch (mutationError) {
      setError(getApiErrorMessage(mutationError))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-foreground shadow-lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold/15 text-gold">
            <FilePlus2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-xl font-semibold">
              {activeAction.kind === 'structure-choice'
                ? 'Comment souhaitez-vous gérer ce produit ?'
                : activeAction.kind === 'decompose-product'
                  ? 'Décomposer le produit'
                  : 'Ajouter un sous-produit'}
            </p>
            {activeAction.kind === 'structure-choice' ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ce choix détermine l'organisation de vos postes de budget.
                  Vous pourrez le modifier ultérieurement.
                </p>
                <div className="mt-4 grid gap-2">
                  {(
                    [
                      {
                        value: 'single',
                        title: 'Un seul poste de budget',
                        description:
                          'Recommandé si vous souhaitez suivre le produit dans son ensemble.',
                      },
                      {
                        value: 'breakdown',
                        title: 'Plusieurs sous-produits',
                        description:
                          'Recommandé si vous souhaitez suivre plusieurs éléments séparément (ex. baie vitrée, fenêtre cuisine, fenêtre chambre...).',
                      },
                    ] satisfies Array<{
                      value: ProductStructureChoice
                      title: string
                      description: string
                    }>
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'rounded-md border px-4 py-3 text-left transition-colors',
                        selectedStructureChoice === option.value
                          ? 'border-gold bg-gold/10'
                          : 'border-border bg-background hover:border-gold/60',
                      )}
                      onClick={() => onSelectStructureChoice(option.value)}
                    >
                      <span className="block font-medium text-foreground">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : activeAction.kind === 'decompose-product' ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Convertissez le produit « {activeAction.product.product_name}{' '}
                  » en plusieurs sous-produits.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="existing-line-name">
                    Nom du poste existant
                  </Label>
                  <Input
                    id="existing-line-name"
                    value={existingLineName}
                    onChange={(event) =>
                      setExistingLineName(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-breakdown-names">
                    Sous-produits à créer
                  </Label>
                  <Textarea
                    id="new-breakdown-names"
                    value={newBreakdownNames}
                    placeholder="Pose menuiserie&#10;Fourniture"
                    onChange={(event) =>
                      setNewBreakdownNames(event.target.value)
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ajoutez un sous-produit au produit «{' '}
                  {activeAction.product.product_name} ».
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="breakdown-name">Nom du sous-produit</Label>
                  <Input
                    id="breakdown-name"
                    value={breakdownName}
                    onChange={(event) => setBreakdownName(event.target.value)}
                  />
                </div>
              </div>
            )}
            {error ? (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isMutating}>
            Fermer
          </Button>
          {activeAction.kind === 'structure-choice' ? (
            <Button onClick={() => onContinue(activeAction)}>Continuer</Button>
          ) : activeAction.kind === 'decompose-product' ? (
            <Button onClick={submitConvertProduct} disabled={isMutating}>
              {isMutating ? 'Conversion...' : 'Convertir'}
            </Button>
          ) : (
            <Button onClick={submitAddBreakdown} disabled={isMutating}>
              {isMutating ? 'Ajout...' : 'Ajouter'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
