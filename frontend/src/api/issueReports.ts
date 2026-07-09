import { useMutation } from '@tanstack/react-query'

import { apiPost } from './client'

export type IssueReportCategory =
  'bug' | 'feature_request' | 'improvement' | 'question'

export type IssueReportMetadata = {
  route: string
  project_name: string | null
  user_agent: string
  timestamp: string
}

export type IssueReportPayload = {
  category: IssueReportCategory
  description: string
  metadata: IssueReportMetadata
  attachments: File[]
}

export function sendIssueReport(payload: IssueReportPayload) {
  const form = new FormData()
  form.append('category', payload.category)
  form.append('description', payload.description)
  form.append('metadata', JSON.stringify(payload.metadata))

  for (const attachment of payload.attachments) {
    form.append('attachments', attachment)
  }

  return apiPost<{ message: string }, FormData>('/issue-reports', form)
}

export function useSendIssueReportMutation() {
  return useMutation({
    mutationFn: sendIssueReport,
  })
}
