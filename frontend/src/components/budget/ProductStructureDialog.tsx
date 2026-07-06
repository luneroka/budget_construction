import { FilePlus2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type {
  ActiveAction,
  BreakdownAction,
  ProductStructureChoice,
} from '@/components/budget/types'
import { cn } from '@/lib/utils'

export function ProductStructureDialog({
  activeAction,
  selectedStructureChoice,
  onSelectStructureChoice,
  onContinue,
  onClose,
}: {
  activeAction: Exclude<ActiveAction, { kind: 'transaction' }>
  selectedStructureChoice: ProductStructureChoice
  onSelectStructureChoice: (choice: ProductStructureChoice) => void
  onContinue: (action: BreakdownAction) => void
  onClose: () => void
}) {
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
              <p className="mt-2 text-sm text-muted-foreground">
                Action de démonstration pour convertir le produit «{' '}
                {activeAction.product.product_name} » en plusieurs
                sous-produits. Cette conversion est déjà prévue dans le modèle
                de budget.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Action de démonstration pour ajouter un sous-produit au produit
                « {activeAction.product.product_name} ». Le formulaire complet
                sera raccordé ultérieurement.
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          {activeAction.kind === 'structure-choice' ? (
            <Button onClick={() => onContinue(activeAction)}>Continuer</Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
