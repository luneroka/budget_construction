export function SuppliersPage() {
  return (
    <section>
      <p className="text-sm font-semibold uppercase text-accent">
        Annuaire
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Fournisseurs</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Gestion des fournisseurs selon les champs backend: nom, contact,
        telephone, email, SIRET et commentaire.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <p className="font-medium text-foreground">Table fournisseurs</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Les colonnes detaillees seront ajoutees avec les composants partages.
        </p>
      </div>
    </section>
  )
}
