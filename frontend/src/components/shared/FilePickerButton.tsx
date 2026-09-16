import { useRef } from 'react'
import { Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getSelectedFile } from '@/lib/files'

/**
 * A file picker that speaks French.
 *
 * A bare `<input type="file">` renders the browser's own control, whose
 * "Choose File" / "No file chosen" wording follows the browser's locale, not
 * the app's — so a French UI showed English buttons on an English-locale
 * browser, and we could not restyle them either. Hiding the input behind a
 * real Button, the way ReportIssueDrawer already did, puts both the wording
 * and the styling back under our control.
 *
 * The input's value is cleared after every pick so that choosing the same file
 * twice in a row still fires `onSelect` — and so callers holding the File in
 * their own state no longer need a `key` remount to reset the control.
 */
export function FilePickerButton({
  accept,
  disabled,
  label = 'Choisir un fichier',
  onSelect,
}: {
  accept?: string
  disabled?: boolean
  label?: string
  onSelect: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden />
        {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(event) => {
          const file = getSelectedFile(event)
          event.currentTarget.value = ''
          onSelect(file)
        }}
      />
    </>
  )
}
