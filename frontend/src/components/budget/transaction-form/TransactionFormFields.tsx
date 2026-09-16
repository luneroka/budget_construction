import type { ReactNode } from 'react'
import { Paperclip } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FilePickerButton } from '@/components/shared/FilePickerButton'
import { Label } from '@/components/ui/label'
import { documentInputAccept, formatFileSize } from '@/lib/files'
import type { BudgetLine, Product, Project } from '@/types'

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

export function CompactSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function TransactionContextSummary({
  project,
  product,
  budgetLine,
}: {
  project: Project
  product: Product
  budgetLine?: BudgetLine
}) {
  const breadcrumbParts = [
    product.category_name,
    product.subcategory_name,
    product.product_name,
    budgetLine?.item_type === 'breakdown' ? budgetLine.name : null,
  ].filter(Boolean)

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/25 px-4 py-3 text-sm md:grid-cols-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Projet</p>
        <p className="truncate font-medium text-foreground">{project.name}</p>
      </div>
      <div className="min-w-0 md:text-right">
        <p className="text-xs text-muted-foreground">Budget</p>
        <p className="truncate font-medium text-foreground">
          {breadcrumbParts.join(' > ')}
        </p>
      </div>
    </div>
  )
}

export function SelectedDocumentPreview({
  file,
  onClear,
}: {
  file: File
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">
          {file.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </span>
      </span>
      <Button size="sm" variant="ghost" type="button" onClick={onClear}>
        Retirer
      </Button>
    </div>
  )
}

export function NewTransactionDocumentField({
  file,
  disabled,
  onFileChange,
  onClear,
}: {
  file: File | null
  disabled?: boolean
  onFileChange: (file: File | null) => void
  onClear: () => void
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden />
        Document
      </div>
      <FilePickerButton
        accept={documentInputAccept}
        disabled={disabled}
        onSelect={onFileChange}
      />
      {file ? <SelectedDocumentPreview file={file} onClear={onClear} /> : null}
    </div>
  )
}
