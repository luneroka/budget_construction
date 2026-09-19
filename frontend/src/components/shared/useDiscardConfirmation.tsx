import { type ReactNode, useState } from 'react'
import { TriangleAlert } from 'lucide-react'

import { ConfirmationDialog } from './ConfirmationDialog'

/**
 * Asks before throwing unsaved changes away. `confirmDiscard(action)` runs
 * the action straight away when nothing is pending, and otherwise asks first:
 * a modal's ×, its Annuler or Fermer, leaving edit mode. Saving closes through
 * its own path and never asks. Render `discardDialog` next to the form.
 */
export function useDiscardConfirmation(hasUnsavedChanges: boolean): {
  confirmDiscard: (action: () => void) => void
  discardDialog: ReactNode
} {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  function confirmDiscard(action: () => void) {
    if (hasUnsavedChanges) setPendingAction(() => action)
    else action()
  }

  const discardDialog = pendingAction ? (
    <ConfirmationDialog
      icon={<TriangleAlert className="h-5 w-5" aria-hidden="true" />}
      title="Abandonner les modifications ?"
      description="Elles n’ont pas été enregistrées et seront perdues."
      cancelLabel="Continuer l’édition"
      confirmLabel="Abandonner"
      onCancel={() => setPendingAction(null)}
      onConfirm={() => {
        setPendingAction(null)
        pendingAction()
      }}
    />
  ) : null

  return { confirmDiscard, discardDialog }
}
