import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import {
  Camera,
  Crop,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'

import {
  type IssueReportCategory,
  useSendIssueReportMutation,
} from '@/api/issueReports'
import { useProjectsQuery } from '@/api/projects'
import { getApiErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatFileSize } from '@/lib/format'
import { captureElementPng } from '@/lib/htmlCapture'
import { cropImageToBlob } from '@/lib/imageCrop'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { cn } from '@/lib/utils'
import { useAppState } from '@/state/appState'

type AttachmentItem = {
  id: string
  file: File
  previewUrl: string | null
}

const categoryOptions: Array<{ value: IssueReportCategory; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'feature_request', label: 'Demande de fonctionnalité' },
  { value: 'improvement', label: 'Amélioration' },
  { value: 'question', label: 'Question' },
]

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function screenshotFilename(prefix: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${prefix}-${timestamp}.png`
}

function fileFromBlob(blob: Blob, filename: string) {
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

function isImage(file: File) {
  return file.type.startsWith('image/')
}

function createAttachment(file: File): AttachmentItem {
  return {
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
  }
}

export function ReportIssueDrawer() {
  const location = useLocation()
  const { selectedProjectId } = useAppState()
  const projectsQuery = useProjectsQuery({ enabled: true })
  const selectedProject = useMemo(
    () =>
      projectsQuery.data?.find(
        (project) => String(project.id) === selectedProjectId,
      ) ?? null,
    [projectsQuery.data, selectedProjectId],
  )
  const sendIssueReportMutation = useSendIssueReportMutation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isHiddenForCapture, setIsHiddenForCapture] = useState(false)
  const [category, setCategory] = useState<IssueReportCategory>('bug')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null)
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null)
  const attachmentsRef = useRef<AttachmentItem[]>([])
  const cropImageUrlRef = useRef<string | null>(null)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    cropImageUrlRef.current = cropImageUrl
  }, [cropImageUrl])

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl)
        }
      }
      if (cropImageUrlRef.current) {
        URL.revokeObjectURL(cropImageUrlRef.current)
      }
    }
  }, [])

  function addFiles(files: File[]) {
    setAttachments((current) => [...current, ...files.map(createAttachment)])
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id)
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl)
      }
      return current.filter((attachment) => attachment.id !== id)
    })
  }

  async function captureCurrentPage() {
    setIsCapturing(true)
    setIsHiddenForCapture(true)

    try {
      await nextAnimationFrame()
      const target = document.querySelector('main') ?? document.body
      const blob = await captureElementPng(target as HTMLElement)
      addFiles([fileFromBlob(blob, screenshotFilename('page-capture'))])
      notifySuccess('Capture ajoutée au rapport.')
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    } finally {
      setIsHiddenForCapture(false)
      setIsCapturing(false)
      setIsOpen(true)
    }
  }

  async function captureSelectedArea() {
    setIsCapturing(true)
    setIsHiddenForCapture(true)

    try {
      await nextAnimationFrame()
      const target = document.querySelector('main') ?? document.body
      const blob = await captureElementPng(target as HTMLElement)
      const imageUrl = URL.createObjectURL(blob)
      setCropImageUrl(imageUrl)
      setCropSourceUrl(imageUrl)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedPixels(null)
    } catch (error) {
      setIsHiddenForCapture(false)
      setIsOpen(true)
      notifyError(getApiErrorMessage(error))
    } finally {
      setIsCapturing(false)
    }
  }

  function closeCropper() {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl)
    }
    setCropImageUrl(null)
    setCropSourceUrl(null)
    setIsHiddenForCapture(false)
    setIsOpen(true)
  }

  async function applyCrop() {
    if (!cropSourceUrl || !croppedPixels) return

    try {
      const blob = await cropImageToBlob(cropSourceUrl, croppedPixels)
      addFiles([fileFromBlob(blob, screenshotFilename('area-capture'))])
      notifySuccess('Zone capturée ajoutée au rapport.')
      closeCropper()
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    }
  }

  async function submitReport() {
    if (!description.trim()) {
      notifyError('Ajoutez une description avant d’envoyer.')
      return
    }

    try {
      await sendIssueReportMutation.mutateAsync({
        category,
        description: description.trim(),
        metadata: {
          route: `${location.pathname}${location.search}${location.hash}`,
          project_name: selectedProject?.name ?? null,
          user_agent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
        attachments: attachments.map((attachment) => attachment.file),
      })

      notifySuccess('Rapport envoyé.')
      setDescription('')
      setCategory('bug')
      setAttachments((current) => {
        for (const attachment of current) {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl)
          }
        }
        return []
      })
      setIsOpen(false)
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    }
  }

  const drawerVisible = isOpen && !isHiddenForCapture
  const busy = sendIssueReportMutation.isPending || isCapturing

  return (
    <>
      <Button
        type="button"
        variant="gold"
        className={cn(
          'fixed bottom-5 right-5 z-40 h-11 rounded-full px-4 shadow-lg',
          isHiddenForCapture && 'hidden',
        )}
        data-capture-ignore="true"
        aria-label="Reporter un problème"
        onClick={() => setIsOpen(true)}
      >
        <HelpCircle aria-hidden />
        Aide
      </Button>

      <aside
        className={cn(
          'fixed right-3 bottom-20 z-50 flex max-h-[calc(100vh-6.5rem)] w-[calc(100vw-1.5rem)] max-w-md flex-col rounded-md border border-border bg-card shadow-2xl transition-all duration-200 sm:right-5 sm:bottom-20 sm:max-h-[min(760px,calc(100vh-6.5rem))]',
          drawerVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0',
        )}
        data-capture-ignore="true"
        aria-hidden={!drawerVisible}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-card-foreground">
              Signaler un problème
            </p>
            <p className="text-xs text-muted-foreground">
              Envoyez un retour avec des captures si nécessaire.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Fermer"
            onClick={() => setIsOpen(false)}
          >
            <X aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="issue-category">Catégorie</Label>
            <Select
              id="issue-category"
              value={category}
              disabled={busy}
              onChange={(event) =>
                setCategory(event.target.value as IssueReportCategory)
              }
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea
              id="issue-description"
              required
              value={description}
              disabled={busy}
              placeholder="Que s’est-il passé ?"
              className="min-h-28 resize-none"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <section className="space-y-3">
            <div>
              <p className="text-sm font-medium text-card-foreground">
                Pièces jointes
              </p>
              <p className="text-xs text-muted-foreground">
                Les fichiers restent dans l’application jusqu’à l’envoi.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={busy}
                onClick={captureCurrentPage}
              >
                {isCapturing ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Camera aria-hidden />
                )}
                Capturer la page actuelle
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={busy}
                onClick={captureSelectedArea}
              >
                <Crop aria-hidden />
                Capturer une zone
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload aria-hidden />
                Ajouter des fichiers
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
              />
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-background p-2"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                      {attachment.previewUrl ? (
                        <img
                          src={attachment.previewUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Paperclip
                          className="h-5 w-5 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {attachment.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.file.size)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Supprimer la pièce jointe"
                      disabled={busy}
                      onClick={() => removeAttachment(attachment.id)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-background px-3 py-4 text-sm text-muted-foreground">
                <ImageIcon className="h-5 w-5" aria-hidden />
                Aucune pièce jointe pour le moment.
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={sendIssueReportMutation.isPending}
            onClick={() => setIsOpen(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={busy || !description.trim()}
            onClick={submitReport}
          >
            {sendIssueReportMutation.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            Envoyer
          </Button>
        </div>
      </aside>

      {cropImageUrl ? (
        <div
          className="fixed inset-0 z-60 flex flex-col bg-slate-950"
          data-capture-ignore="true"
        >
          <div className="relative min-h-0 flex-1">
            <Cropper
              image={cropImageUrl}
              crop={crop}
              zoom={zoom}
              aspect={4 / 3}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, croppedAreaPixels) =>
                setCroppedPixels(croppedAreaPixels)
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-slate-950 px-4 py-3">
            <label className="flex min-w-0 flex-1 items-center gap-3 text-sm text-white">
              <span className="shrink-0">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                className="w-full"
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
            <Button type="button" variant="secondary" onClick={closeCropper}>
              Annuler
            </Button>
            <Button type="button" variant="gold" onClick={applyCrop}>
              Joindre la zone
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
