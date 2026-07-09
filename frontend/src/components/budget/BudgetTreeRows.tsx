import { ChevronDown, Hammer, Layers3, Plus, Trash2 } from 'lucide-react'
import { forwardRef } from 'react'

import { categoryIcons } from '@/components/budget/budgetCategoryIcons'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import type {
  BudgetLineDeleteState,
  BreakdownAction,
  TransactionAction,
} from '@/components/budget/types'
import type { BudgetCategory, BudgetLine, Product } from '@/types'
import { formatCurrency } from '@/lib/format'
import {
  formatSelectedBudgetSource,
  type SubcategoryGroup,
  varianceClass,
} from '@/lib/budgetDomain'
import { cn } from '@/lib/utils'
import { highlightSearchMatches } from '@/lib/searchHighlight'

function ToggleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <ChevronDown
      className={cn(
        'h-4 w-4 shrink-0 transition-transform',
        isOpen && 'rotate-180',
      )}
      aria-hidden="true"
    />
  )
}

export function CategoryHeader({
  category,
  isOpen,
  onToggle,
}: {
  category: BudgetCategory
  isOpen: boolean
  onToggle: () => void
}) {
  const variance =
    category.selected_budget_amount_ttc - category.actual_cost_amount_ttc
  const Icon = categoryIcons[category.category_name] ?? Hammer

  return (
    <button
      type="button"
      className="grid w-full grid-cols-1 gap-y-3 bg-primary px-4 py-3 text-left text-primary-foreground transition-colors hover:bg-primary/95 sm:grid-cols-[minmax(18rem,1fr)_7.25rem_7.25rem_7.25rem] sm:items-center sm:gap-x-1"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-foreground/10 text-primary-foreground/90"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-lg font-semibold">
            {category.category_name}
          </span>
          <span className="mt-0.5 block text-xs text-primary-foreground/75">
            {category.products.length} produits
          </span>
        </span>
      </span>
      <span className="text-right text-xs">
        <span className="block text-primary-foreground/65">Budget</span>
        <span className="font-semibold">
          {formatCurrency(category.selected_budget_amount_ttc)}
        </span>
      </span>
      <span className="text-right text-xs">
        <span className="block text-primary-foreground/65">Facturé</span>
        <span className="font-semibold">
          {formatCurrency(category.actual_cost_amount_ttc)}
        </span>
      </span>
      <span className="text-right text-xs">
        <span className="block text-primary-foreground/65">Écart</span>
        <span className="font-semibold">{formatCurrency(variance)}</span>
      </span>
    </button>
  )
}

export function ProductContextRows({
  product,
  line,
  readOnly,
  onAddBreakdown,
  onAddTransaction,
  onDecomposeProduct,
}: {
  product: Product
  line: BudgetLine | null
  readOnly?: boolean
  onAddBreakdown: (action: BreakdownAction) => void
  onAddTransaction: (action: TransactionAction) => void
  onDecomposeProduct: (action: BreakdownAction) => void
}) {
  const supportsBreakdowns = line === null

  return (
    <TableRow className="border-t-0 bg-card hover:bg-card!">
      <TableCell colSpan={7} className="px-6! pt-0! pb-0!">
        <div className="flex items-center justify-between pt-1 pb-3">
          <span className="text-xs text-muted-foreground">
            {supportsBreakdowns
              ? 'Produit décomposé en sous-produits'
              : 'Transactions rattachées directement au produit'}
          </span>
          {readOnly ? null : (
            <div className="flex items-center justify-end gap-1">
              {supportsBreakdowns ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-muted-foreground hover:bg-gold/15! hover:text-gold!"
                  onClick={() => onAddBreakdown({ product })}
                >
                  <Layers3 aria-hidden="true" />
                  Ajouter un sous-produit
                </Button>
              ) : line ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-muted-foreground hover:bg-gold/15! hover:text-gold!"
                    onClick={() => onDecomposeProduct({ product })}
                  >
                    <Layers3 aria-hidden="true" />
                    Décomposer le produit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-muted-foreground hover:bg-gold/15! hover:text-gold!"
                    onClick={() =>
                      onAddTransaction({ budgetLine: line, product })
                    }
                  >
                    <Plus aria-hidden="true" />
                    Ajouter une transaction
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function EmptyProductRow({
  product,
  readOnly,
  onAddFirstTransaction,
}: {
  product: Product
  readOnly?: boolean
  onAddFirstTransaction: (action: BreakdownAction) => void
}) {
  return (
    <TableRow className="border-t-0 bg-card hover:bg-card!">
      <TableCell colSpan={7} className="px-6 py-4">
        <div className="flex items-center justify-between border-t border-border/50 pt-4 pl-7">
          <div>
            <p className="text-sm font-medium text-foreground">
              Aucune transaction
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {readOnly
                ? 'Ce produit ne contient pas encore de transaction.'
                : 'Commencez par ajouter une première transaction pour ce produit.'}
            </p>
          </div>
          {readOnly ? null : (
            <Button
              size="sm"
              variant="gold"
              onClick={() => onAddFirstTransaction({ product })}
            >
              <Plus aria-hidden="true" />
              Ajouter une première transaction
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function BudgetLineContextRow({
  line,
  product,
  readOnly,
  onAddTransaction,
}: {
  line: BudgetLine
  product: Product
  readOnly?: boolean
  onAddTransaction: (action: TransactionAction) => void
}) {
  return (
    <TableRow className="border-t-0 bg-muted/25 hover:bg-muted/25!">
      <TableCell colSpan={7} className="px-6! pt-1! pb-0!">
        <div className="flex items-center justify-between pt-1 pb-3">
          <span className="text-xs text-muted-foreground">
            Transactions pour ce sous-produit
          </span>
          {readOnly ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground hover:bg-gold/15! hover:text-gold!"
              onClick={() => onAddTransaction({ budgetLine: line, product })}
            >
              <Plus aria-hidden="true" />
              Ajouter une transaction
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function SubcategoryRow({
  group,
  isOpen,
  onToggle,
}: {
  group: SubcategoryGroup
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <TableRow className="border-y border-primary/40 bg-primary/10 hover:bg-primary/10">
      <TableCell colSpan={7} className="px-4 py-2">
        <button
          type="button"
          className="grid w-full grid-cols-1 gap-y-3 text-left sm:grid-cols-[minmax(18rem,1fr)_7.25rem_7.25rem_7.25rem] sm:items-center sm:gap-x-1"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div>
              <p className="truncate text-base font-semibold text-primary">
                {group.name}
              </p>
              <p className="mt-0.5 text-xs text-primary/70">
                {group.products.length} produits
              </p>
            </div>
          </div>
          <span className="text-right text-xs">
            <span className="block text-primary/65">Budget</span>
            <span className="font-semibold text-primary/80">
              {formatCurrency(group.selected_budget_amount_ttc)}
            </span>
          </span>
          <span className="text-right text-xs">
            <span className="block text-primary/65">Facturé</span>
            <span className="font-semibold text-primary/80">
              {formatCurrency(group.actual_cost_amount_ttc)}
            </span>
          </span>
          <span className="text-right text-xs">
            <span className="block text-primary/65">Écart</span>
            <span
              className={cn(
                'font-semibold',
                varianceClass(group.selected_budget_variance_ttc),
              )}
            >
              {formatCurrency(group.selected_budget_variance_ttc)}
            </span>
          </span>
        </button>
      </TableCell>
    </TableRow>
  )
}

export const ProductRow = forwardRef<
  HTMLTableRowElement,
  {
    product: Product
    isFocused?: boolean
    isOpen: boolean
    searchQuery?: string
    onToggle: () => void
  }
>(function ProductRow(
  { product, isFocused, isOpen, searchQuery = '', onToggle },
  ref,
) {
  return (
    <TableRow
      ref={ref}
      className={cn(
        'bg-card hover:bg-muted/40',
        isFocused && 'ring-2 ring-gold ring-inset',
      )}
    >
      <TableCell colSpan={7} className="px-4 py-2">
        <button
          type="button"
          className="grid w-full grid-cols-1 gap-y-3 text-left sm:grid-cols-[minmax(18rem,1fr)_7.25rem_7.25rem_7.25rem] sm:items-center sm:gap-x-1"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <span className="flex min-w-0 items-center gap-3">
            <ToggleIcon isOpen={isOpen} />
            <span className="block font-medium text-foreground">
              {highlightSearchMatches(product.product_name, searchQuery)}
            </span>
          </span>
          <span className="hidden text-right text-xs">
            <span className="block text-muted-foreground">Budget</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(product.selected_budget_amount_ttc)}
            </span>
          </span>
          <span className="hidden text-right text-xs">
            <span className="block text-muted-foreground">Facturé</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(product.actual_cost_amount_ttc)}
            </span>
          </span>
          <span className="hidden text-right text-xs">
            <span className="block text-muted-foreground">Écart</span>
            <span
              className={cn(
                'font-semibold',
                varianceClass(product.selected_budget_variance_ttc),
              )}
            >
              {formatCurrency(product.selected_budget_variance_ttc)}
            </span>
          </span>
        </button>
      </TableCell>
    </TableRow>
  )
})

export function BudgetLineRow({
  line,
  product,
  isOpen,
  readOnly,
  searchQuery = '',
  onRequestDelete,
  onToggle,
}: {
  line: BudgetLine
  product: Product
  isOpen: boolean
  readOnly?: boolean
  searchQuery?: string
  onRequestDelete: (context: BudgetLineDeleteState) => void
  onToggle: () => void
}) {
  return (
    <TableRow className="bg-muted/25 hover:bg-muted/50">
      <TableCell colSpan={7} className="px-4 py-2 pl-12">
        <div className="grid w-full grid-cols-1 gap-y-3 text-left sm:grid-cols-[minmax(18rem,1fr)_7.25rem_7.25rem_7.25rem] sm:items-center sm:gap-x-1">
          <span className="flex min-w-0 items-center justify-between gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={onToggle}
              aria-expanded={isOpen}
            >
              <span
                className="h-7 w-1.5 rounded-full bg-gold/75"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {highlightSearchMatches(line.name, searchQuery)}
                </span>
                <span className="hidden mt-1 text-xs text-muted-foreground">
                  Budget sélectionné:{' '}
                  {formatCurrency(line.selected_budget_amount_ttc)} (
                  {formatSelectedBudgetSource(line)})
                </span>
              </span>
            </button>
            {readOnly || line.item_type !== 'breakdown' ? null : (
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onRequestDelete({ line, product })}
                aria-label={`Supprimer le sous-produit ${line.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </span>
          <span className="hidden text-right text-xs">
            <span className="block text-muted-foreground">Budget</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(line.selected_budget_amount_ttc)}
            </span>
          </span>
          <span className="hidden text-right text-xs">
            <span className="block text-muted-foreground">Facturé</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(line.actual_cost_amount_ttc)}
            </span>
          </span>
          <span className="hidden text-right text-xs">
            <span className="block text-muted-foreground">Écart</span>
            <span
              className={cn(
                'font-semibold',
                varianceClass(line.selected_budget_variance_ttc),
              )}
            >
              {formatCurrency(line.selected_budget_variance_ttc)}
            </span>
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}
