export function DocumentsPage() {
  return (
    <section>
      <p className="text-sm font-semibold uppercase text-accent">
        Justificatifs
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Documents</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Recherche et suivi des fichiers rattaches aux transactions du projet.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <p className="font-medium text-foreground">Table documents</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Fichier, type MIME, taille, transaction, date d'ajout et etat derive.
        </p>
      </div>
    </section>
  )
}
