import { getDocumentDownloadUrl } from '@/api/documents'
import { triggerBrowserDownload } from '@/lib/downloads'
import { notifySuccess } from '@/lib/toasts'

export async function downloadDocument(
  documentId: number,
  filename: string,
): Promise<void> {
  const { url } = await getDocumentDownloadUrl(documentId, false)
  triggerBrowserDownload(url, filename)
  notifySuccess('Document téléchargé.')
}
