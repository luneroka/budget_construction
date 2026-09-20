import { subProductName } from '@/lib/transactionWorkspace'
import type { BudgetLine, Product } from '@/types'

// A transaction's place in the budget: the product it belongs to, with the
// sub-product underneath when it sits on one.
export function ProductCell({
  product,
  budgetLine,
}: {
  product: Product
  budgetLine: BudgetLine
}) {
  const subProduct = subProductName(product, budgetLine)

  return (
    <div className="min-w-0">
      <div>{product.product_name}</div>
      {subProduct ? (
        <div className="text-xs text-muted-foreground">{subProduct}</div>
      ) : null}
    </div>
  )
}
