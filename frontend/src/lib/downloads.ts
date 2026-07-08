export function triggerBrowserDownload(url: string, filename: string) {
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener noreferrer'
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)

  try {
    triggerBrowserDownload(url, filename)
  } finally {
    window.URL.revokeObjectURL(url)
  }
}
