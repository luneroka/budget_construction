import { getDocumentDownloadUrl } from '@/api/documents'
import { getSupplierDocumentDownloadUrl } from '@/api/supplier-documents'
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

export async function downloadSupplierDocument(
  documentId: number,
  filename: string,
): Promise<void> {
  const { url } = await getSupplierDocumentDownloadUrl(documentId, false)
  triggerBrowserDownload(url, filename)
  notifySuccess('Document téléchargé.')
}

export function formatDocumentViewerTitle(
  label: string,
  index: number,
  total: number,
): string {
  return total > 1 ? `${label} · Document ${index}/${total}` : label
}

export function formatOriginalFilename(filename: string): string {
  return `Fichier original : ${filename}`
}
