import { useMutation } from '@tanstack/react-query'

import { apiPost } from './client'

export type ContactRequestPayload = {
  name: string
  email: string
  reason: string
  message: string
  website?: string
}

export function sendContactRequest(payload: ContactRequestPayload) {
  return apiPost<{ message: string }, ContactRequestPayload>(
    '/contact-requests',
    payload,
  )
}

export function useSendContactRequestMutation() {
  return useMutation({
    mutationFn: sendContactRequest,
  })
}
