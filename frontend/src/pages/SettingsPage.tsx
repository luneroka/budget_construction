export function SettingsPage() {
  return (
    <section>
      <p className="text-sm font-semibold uppercase text-accent">
        Configuration
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Parametres</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Point d'entree pour les reglages, le catalogue et les modeles de projet.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium text-foreground">Catalogue</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Categories, sous-categories et produits.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="font-medium text-foreground">Modeles</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Perimetres de produits utilises a la creation d'un projet.
          </p>
        </div>
      </div>
    </section>
  )
}
