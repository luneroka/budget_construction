import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/shared/PageHeader'
import { buttonVariants } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <section>
      <PageHeader
        eyebrow="Introuvable"
        title="Page inconnue"
        description="Cette route ne correspond a aucun ecran de l'application."
      />
      <Link
        to="/dashboard"
        className={buttonVariants({ className: 'mt-6' })}
      >
        Retour au dashboard
      </Link>
    </section>
  )
}
