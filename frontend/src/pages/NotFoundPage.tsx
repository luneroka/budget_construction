import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section>
      <p className="text-sm font-semibold uppercase text-destructive">
        Introuvable
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Page inconnue</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">
        Cette route ne correspond a aucun ecran de l'application.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Retour au dashboard
      </Link>
    </section>
  )
}
