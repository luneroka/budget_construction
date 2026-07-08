import { useMutation } from '@tanstack/react-query'

import { apiClient } from './client'

export type AccountingExportTransactionType =
  'all' | 'invoices' | 'quotes' | 'diy_estimates'

export type AccountingCsvExportParams = {
  startDate?: string
  endDate?: string
  transactionType: AccountingExportTransactionType
}

export type AccountingCsvExport = {
  blob: Blob
  filename: string
}

function getFilenameFromContentDisposition(
  contentDisposition: string | undefined,
): string | null {
  if (!contentDisposition) return null

  const match = /filename="?(?<filename>[^";]+)"?/i.exec(contentDisposition)
  return match?.groups?.filename ?? null
}

export async function getAccountingCsvExport(
  projectId: number,
  params: AccountingCsvExportParams,
): Promise<AccountingCsvExport> {
  const response = await apiClient.get<Blob>(
    `/projects/${projectId}/exports/accounting.csv`,
    {
      params: {
        start_date: params.startDate || undefined,
        end_date: params.endDate || undefined,
        transaction_type: params.transactionType,
      },
      responseType: 'blob',
    },
  )

  return {
    blob: response.data,
    filename:
      getFilenameFromContentDisposition(
        response.headers['content-disposition'],
      ) ?? `project-${projectId}-accounting.csv`,
  }
}

export function useAccountingCsvExportMutation() {
  return useMutation({
    mutationFn: ({
      projectId,
      params,
    }: {
      projectId: number
      params: AccountingCsvExportParams
    }) => getAccountingCsvExport(projectId, params),
  })
}
