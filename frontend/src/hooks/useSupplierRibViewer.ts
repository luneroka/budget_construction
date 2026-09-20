import { useState } from 'react'

import { getApiErrorMessage } from '@/api/client'
import { getSupplierDocumentDownloadUrl } from '@/api/supplier-documents'
import type { SupplierDocumentListRead } from '@/api/types'
import { downloadSupplierDocument } from '@/lib/documents'
import { notifyError } from '@/lib/toasts'

// Opening a supplier's bank details in the document viewer: the same two
// steps (signed URL, then download) wherever a RIB is shown.
export function useSupplierRibViewer() {
  const [rib, setRib] = useState<{
    document: SupplierDocumentListRead
    url: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open(document: SupplierDocumentListRead) {
    setIsLoading(true)
    setError(null)

    try {
      const { url } = await getSupplierDocumentDownloadUrl(document.id, true)
      setRib({ document, url })
    } catch (caught) {
      notifyError(`Impossible d’ouvrir le RIB. ${getApiErrorMessage(caught)}`)
    } finally {
      setIsLoading(false)
    }
  }

  function close() {
    setRib(null)
    setError(null)
  }

  async function download() {
    if (!rib) return

    setIsLoading(true)
    setError(null)

    try {
      await downloadSupplierDocument(
        rib.document.id,
        rib.document.original_filename,
      )
    } catch (caught) {
      const message = getApiErrorMessage(caught)
      setError(message)
      notifyError(`Impossible de télécharger le RIB. ${message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return { rib, isLoading, error, open, close, download }
}
