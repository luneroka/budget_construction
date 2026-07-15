import { useEffect, useState } from 'react'

import { getApiErrorMessage } from '@/api/client'
import {
  getDocumentDownloadUrl,
  getTransactionDocuments,
} from '@/api/documents'
import type { DocumentRead } from '@/api/types'
import { downloadDocument } from '@/lib/documents'
import { notifyError } from '@/lib/toasts'

type ViewerTarget = {
  documents: DocumentRead[]
  index: number
  contextLabel: string
}

export function useTransactionDocumentViewer() {
  const [target, setTarget] = useState<ViewerTarget | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentDocument = target ? target.documents[target.index] : null

  useEffect(() => {
    if (!currentDocument) {
      setUrl(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    getDocumentDownloadUrl(currentDocument.id, true)
      .then(({ url: downloadUrl }) => {
        if (!cancelled) setUrl(downloadUrl)
      })
      .catch((downloadError) => {
        if (!cancelled) setError(getApiErrorMessage(downloadError))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentDocument])

  async function open(transactionId: number, contextLabel: string) {
    setIsLoading(true)
    setError(null)

    try {
      const documents = await getTransactionDocuments(transactionId)
      if (documents.length === 0) {
        const message = 'Aucun document joint à cette transaction.'
        setError(message)
        notifyError(message)
        setIsLoading(false)
        return
      }

      setTarget({ documents, index: 0, contextLabel })
    } catch (fetchError) {
      const message = getApiErrorMessage(fetchError)
      setError(message)
      notifyError(`Impossible d’ouvrir le document. ${message}`)
      setIsLoading(false)
    }
  }

  function close() {
    setTarget(null)
    setUrl(null)
    setError(null)
  }

  function goToPrevious() {
    setTarget((current) =>
      current && current.index > 0
        ? { ...current, index: current.index - 1 }
        : current,
    )
  }

  function goToNext() {
    setTarget((current) =>
      current && current.index < current.documents.length - 1
        ? { ...current, index: current.index + 1 }
        : current,
    )
  }

  async function download() {
    if (!currentDocument) return

    try {
      await downloadDocument(
        currentDocument.id,
        currentDocument.original_filename,
      )
    } catch (downloadError) {
      notifyError(
        `Impossible de télécharger le document. ${getApiErrorMessage(downloadError)}`,
      )
    }
  }

  return {
    isOpen: target !== null,
    document: currentDocument,
    index: target?.index ?? 0,
    count: target?.documents.length ?? 0,
    contextLabel: target?.contextLabel ?? '',
    url,
    isLoading,
    error,
    open,
    close,
    goToPrevious,
    goToNext,
    download,
  }
}
