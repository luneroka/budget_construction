import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { buttonVariants } from '@/components/ui/button'

export function SettingsBackButton() {
  return (
    <Link
      to="/settings"
      className={buttonVariants({
        variant: 'outline',
        size: 'sm',
        className: 'mb-6',
      })}
    >
      <ArrowLeft aria-hidden="true" />
      Retour aux paramètres
    </Link>
  )
}
