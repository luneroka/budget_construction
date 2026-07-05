function App() {
  return (
    <main className="min-h-screen bg-background text-foreground font-body">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
        <div className="w-full rounded-lg border border-border bg-card p-8">
          <p className="text-sm font-semibold uppercase text-accent">
            Budget Construction
          </p>
          <h1 className="mt-3 font-heading text-3xl font-bold text-foreground">
            Fondations UI admin
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Les tokens Tailwind 4 du design de reference sont actifs. Le shell,
            la navigation et les pages metier arrivent dans les prochains chunks.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-muted p-4">
              <p className="text-sm text-muted-foreground">Canvas</p>
              <p className="mt-1 font-medium text-primary">bg-background</p>
            </div>
            <div className="rounded-md bg-sidebar p-4 text-sidebar-foreground">
              <p className="text-sm text-sidebar-foreground/70">Sidebar</p>
              <p className="mt-1 font-medium text-gold">text-gold</p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">Statuts</p>
              <p className="mt-1 font-medium text-success">success</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
