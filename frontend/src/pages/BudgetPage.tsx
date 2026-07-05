export function BudgetPage() {
  return (
    <section>
      <p className="text-sm font-semibold uppercase text-accent">
        Workspace
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Budget</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Espace operationnel pour parcourir categories, produits, lignes de
        budget et transactions du projet selectionne.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-card p-6">
        <p className="font-medium text-foreground">Hierarchie budget</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Category &gt; Product &gt; Budget Line &gt; Transactions.
        </p>
      </div>
    </section>
  )
}
