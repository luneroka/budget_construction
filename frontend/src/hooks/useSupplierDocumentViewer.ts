import { useState } from 'react'

import { getApiErrorMessage } from '@/api/client'
import { getSupplierDocumentDownloadUrl } from '@/api/supplier-documents'
import type { SupplierDocumentType } from '@/api/types'
import { downloadSupplierDocument } from '@/lib/documents'
import { supplierDocumentTypeLabels } from '@/lib/supplierDocuments'
import { notifyError } from '@/lib/toasts'

type ViewableSupplierDocument = {
  id: number
  original_filename: string
  type: SupplierDocumentType
}

// Opening a supplier document in the document viewer: the same two steps
// (signed URL, then download) wherever one is shown, titled with its type.
export function useSupplierDocumentViewer() {
  const [viewed, setViewed] = useState<{
    document: ViewableSupplierDocument
    title: string
    url: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open(
    document: ViewableSupplierDocument,
    supplierName: string,
  ) {
    setIsLoading(true)
    setError(null)

    try {
      const { url } = await getSupplierDocumentDownloadUrl(document.id, true)
      setViewed({
        document,
        title: `${supplierDocumentTypeLabels[document.type]} • ${supplierName}`,
        url,
      })
    } catch (caught) {
      notifyError(
        `Impossible d’ouvrir le document. ${getApiErrorMessage(caught)}`,
      )
    } finally {
      setIsLoading(false)
    }
  }

  function close() {
    setViewed(null)
    setError(null)
  }

  async function download() {
    if (!viewed) return

    setIsLoading(true)
    setError(null)

    try {
      await downloadSupplierDocument(
        viewed.document.id,
        viewed.document.original_filename,
      )
    } catch (caught) {
      const message = getApiErrorMessage(caught)
      setError(message)
      notifyError(`Impossible de télécharger le document. ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return { viewed, isLoading, error, open, close, download }
}
