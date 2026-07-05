import type { ComponentType, ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type SectionCardProps = {
  title: string
  description?: string
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  children: ReactNode
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: SectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
