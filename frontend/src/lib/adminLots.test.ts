import { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'

import type { ApiErrorBody } from '@/api/client'
import type { GlobalLotRead } from '@/api/types'

import {
  EMPTY_NEW_LOT_FORM,
  deleteLotConfirmation,
  deleteLotLabel,
  newLotPayload,
  refusedLotDeletion,
  refusedNewLot,
} from './adminLots'

function apiError(status: number, code: string): AxiosError<ApiErrorBody> {
  const data: ApiErrorBody = {
    detail: { code, message: 'English fallback' },
  }
  const response = { status, data } as AxiosResponse<ApiErrorBody>
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    response,
  )
}

const lot: GlobalLotRead = {
  id: 6,
  code: '05',
  designation: 'Étanchéité',
  sort_order: 5,
}

describe('newLotPayload', () => {
  it('sends both fields trimmed', () => {
    expect(
      newLotPayload({
        ...EMPTY_NEW_LOT_FORM,
        code: '  25 ',
        designation: ' Garage  ',
      }),
    ).toEqual({ code: '25', designation: 'Garage' })
  })

  it('sends nothing while a field is blank', () => {
    expect(newLotPayload(EMPTY_NEW_LOT_FORM)).toBeNull()
    expect(
      newLotPayload({ ...EMPTY_NEW_LOT_FORM, code: '25', designation: '  ' }),
    ).toBeNull()
    expect(
      newLotPayload({
        ...EMPTY_NEW_LOT_FORM,
        code: ' ',
        designation: 'Garage',
      }),
    ).toBeNull()
  })
})

describe('refusedNewLot', () => {
  it('keeps what was typed and shows a duplicate inline, in French', () => {
    const form = { code: '05', designation: 'Garage', error: null }

    expect(refusedNewLot(form, apiError(409, 'lot_code_conflict'))).toEqual({
      code: '05',
      designation: 'Garage',
      error: 'Un lot utilise déjà ce code.',
    })
    expect(
      refusedNewLot(form, apiError(409, 'lot_designation_conflict')).error,
    ).toBe('Un lot porte déjà cette désignation.')
  })
})

describe('deleteLotConfirmation', () => {
  it('names the lot by code and designation, for every project', () => {
    const { title, description } = deleteLotConfirmation(lot)

    expect(title).toBe('Supprimer le lot 05 « Étanchéité » ?')
    expect(description).toContain('disparaît de tous les projets')
  })

  it('labels the icon-only button with the lot', () => {
    expect(deleteLotLabel(lot)).toBe('Supprimer le lot 05')
  })
})

describe('refusedLotDeletion', () => {
  it('keeps the dialog on the lot with the French refusal inline', () => {
    expect(
      refusedLotDeletion({ lot, error: null }, apiError(409, 'lot_in_use')),
    ).toEqual({
      lot,
      error: 'Ce lot est utilisé et ne peut pas être supprimé.',
    })
  })
})
