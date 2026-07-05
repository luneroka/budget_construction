export function DashboardPage() {
  return (
    <section>
      <p className="text-sm font-semibold uppercase text-accent">
        Vue projet
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold">
        Tableau de bord
      </h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Apercu financier du projet selectionne. Les indicateurs detailles seront
        branches sur les donnees de synthese dans les prochains chunks.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <p className="font-medium text-foreground">Espace dashboard</p>
        <p className="mt-2 text-sm text-muted-foreground">
          KPIs, graphiques et transactions recentes seront ajoutes ici.
        </p>
      </div>
    </section>
  )
}
