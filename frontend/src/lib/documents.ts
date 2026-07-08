import { getDocumentDownloadUrl } from '@/api/documents'
import { notifySuccess } from '@/lib/toasts'

function triggerBrowserDownload(url: string, filename: string) {
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener noreferrer'
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

export async function downloadDocument(
  documentId: number,
  filename: string,
): Promise<void> {
  const { url } = await getDocumentDownloadUrl(documentId, false)
  triggerBrowserDownload(url, filename)
  notifySuccess('Document téléchargé.')
}
