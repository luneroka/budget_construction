import { getApiErrorMessage } from '@/api/client'
import type { GlobalLotRead, LotCreate } from '@/api/types'

// The admin « Lots » screen (/settings/lots): its add form and its delete
// confirmation.

// The limits the API enforces on a lot.
export const LOT_CODE_MAX_LENGTH = 10
export const LOT_DESIGNATION_MAX_LENGTH = 120

/** The add form, inline below the last lot. */
export type NewLotForm = {
  code: string
  designation: string
  error: string | null
}

export const EMPTY_NEW_LOT_FORM: NewLotForm = {
  code: '',
  designation: '',
  error: null,
}

/** What the add form sends: both fields trimmed, or null while one is
 * blank (the API would refuse it). */
export function newLotPayload(form: NewLotForm): LotCreate | null {
  const code = form.code.trim()
  const designation = form.designation.trim()
  if (code === '' || designation === '') return null
  return { code, designation }
}

/** A refused creation keeps what was typed and shows why, translated by
 * `detail.code` (a duplicate code or designation, say). */
export function refusedNewLot(form: NewLotForm, error: unknown): NewLotForm {
  return { ...form, error: getApiErrorMessage(error) }
}

/** The lot the delete dialog is open on, and the refusal it shows. */
export type LotDeletion = {
  lot: GlobalLotRead
  error: string | null
}

export function deleteLotLabel(lot: GlobalLotRead): string {
  return `Supprimer le lot ${lot.code}`
}

export function deleteLotConfirmation(lot: GlobalLotRead): {
  title: string
  description: string
} {
  return {
    title: `Supprimer le lot ${lot.code} « ${lot.designation} » ?`,
    description:
      'Le lot disparaît de tous les projets. Les fournisseurs restent, mais ne lui sont plus rattachés. Cette suppression est définitive.',
  }
}

/** A refused delete (the lot is in use) keeps the dialog open on the same
 * lot, with the message inline; the lot stays in the list. */
export function refusedLotDeletion(
  deletion: LotDeletion,
  error: unknown,
): LotDeletion {
  return { ...deletion, error: getApiErrorMessage(error) }
}
