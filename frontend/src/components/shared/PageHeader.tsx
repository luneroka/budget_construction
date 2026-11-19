import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description?: string
  /** Under the description: a supplier's lot badges, say. */
  meta?: ReactNode
  actions?: ReactNode
}

export function PageHeader({
  title,
  description,
  meta,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-3xl text-muted-foreground">{description}</p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
