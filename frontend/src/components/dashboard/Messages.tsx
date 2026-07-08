export function DashboardMessage({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export function DashboardChartMessage({ children }: { children: string }) {
  return (
    <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export function DashboardWidgetMessage({ children }: { children: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
