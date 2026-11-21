import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'

type ChartCardProps = {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}

export function ChartCard({
  title,
  description,
  action,
  children,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          {/* A card title in the body font, as on the Lots and supplier
              pages. */}
          <h3 className="font-[family-name:var(--font-body)] text-lg leading-none font-semibold text-foreground">
            {title}
          </h3>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
