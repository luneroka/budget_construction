import { Link } from 'react-router-dom'

// A supplier's name, wherever it is listed, leads to its page. Without an id
// (a transaction with no supplier, a deleted one) it stays plain text.
export function SupplierLink({
  supplierId,
  name,
}: {
  supplierId: string | number | null
  name: string | null
}) {
  if (!name) return null
  if (supplierId === null || supplierId === '') return <>{name}</>

  return (
    <Link
      to={`/suppliers/${supplierId}`}
      className="rounded-sm underline-offset-4 hover:text-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {name}
    </Link>
  )
}
