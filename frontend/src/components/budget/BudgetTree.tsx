import { Fragment, useEffect, useMemo, useRef } from 'react'
import { Hammer, Layers3, type LucideIcon } from 'lucide-react'

import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import {
  BudgetLineContextRow,
  BudgetLineRow,
  EmptyProductRow,
  ProductContextRows,
  ProductRow,
} from '@/components/budget/BudgetTreeRows'
import { TransactionsPanel } from '@/components/budget/TransactionsPanel'
import { categoryIcons } from '@/components/budget/budgetCategoryIcons'
import type {
  BudgetLineDeleteState,
  BreakdownAction,
  TransactionAction,
} from '@/components/budget/types'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { BudgetCategory, BudgetLine, Transaction } from '@/types'
import { useBudgetExpansion } from '@/hooks/useBudgetExpansion'
import type { BudgetSelectionState } from '@/lib/budgetDomain'
import {
  getWholeProductBudgetLine,
  groupProductsBySubcategory,
  isProductEmpty,
  varianceClass,
} from '@/lib/budgetDomain'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

type BudgetTreeProps = {
  categories: BudgetCategory[]
  selectedCategoryId: string
  selectedSubcategoryName: string
  getBudgetSelection: (line: BudgetLine) => BudgetSelectionState
  getLineWithBudgetSelection: (line: BudgetLine) => BudgetLine
  projectId?: number
  focusedProductId?: string | null
  readOnly?: boolean
  onAddBreakdown: (action: BreakdownAction) => void
  onAddFirstTransaction: (action: BreakdownAction) => void
  onAddTransaction: (action: TransactionAction) => void
  onDecomposeProduct: (action: BreakdownAction) => void
  onToggleBudgetSelection: (line: BudgetLine, transaction: Transaction) => void
  onRequestDeleteBudgetLine: (context: BudgetLineDeleteState) => void
  onRequestDeleteTransaction: (context: ViewedTransactionContext) => void
  onEditTransaction: (context: ViewedTransactionContext) => void
  onViewTransaction: (context: ViewedTransactionContext) => void
  onViewTransactionDocuments: (transaction: Transaction) => void
  onSelectCategory: (categoryId: string) => void
  onSelectSubcategory: (subcategoryName: string) => void
}

type CategoryNavigationCard = {
  id: string
  name: string
  productCount: number
  selectedBudgetAmountTtc: number
  actualCostAmountTtc: number
  varianceTtc: number
  icon: LucideIcon
}

const ALL_CATEGORIES_ID = 'all'
const ALL_SUBCATEGORIES_ID = 'all'

function CategoryCard({
  category,
  isSelected,
  onSelect,
}: {
  category: CategoryNavigationCard
  isSelected: boolean
  onSelect: () => void
}) {
  const Icon = category.icon

  return (
    <button
      type="button"
      className={cn(
        'rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5',
        isSelected
          ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
          : 'border-border',
      )}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary/10 text-primary',
            )}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {category.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {category.productCount} produits
            </span>
          </span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <span>
          <span className="block text-muted-foreground">Budget</span>
          <span className="font-semibold text-foreground">
            {formatCurrency(category.selectedBudgetAmountTtc)}
          </span>
        </span>
        <span>
          <span className="block text-muted-foreground">Facturé</span>
          <span className="font-semibold text-foreground">
            {formatCurrency(category.actualCostAmountTtc)}
          </span>
        </span>
        <span>
          <span className="block text-muted-foreground">Écart</span>
          <span
            className={cn('font-semibold', varianceClass(category.varianceTtc))}
          >
            {formatCurrency(category.varianceTtc)}
          </span>
        </span>
      </div>
    </button>
  )
}

export function BudgetTree({
  categories,
  selectedCategoryId,
  selectedSubcategoryName,
  getBudgetSelection,
  getLineWithBudgetSelection,
  focusedProductId,
  projectId,
  readOnly,
  onAddBreakdown,
  onAddFirstTransaction,
  onAddTransaction,
  onDecomposeProduct,
  onToggleBudgetSelection,
  onRequestDeleteBudgetLine,
  onRequestDeleteTransaction,
  onEditTransaction,
  onViewTransaction,
  onViewTransactionDocuments,
  onSelectCategory,
  onSelectSubcategory,
}: BudgetTreeProps) {
  const {
    openProducts,
    openBudgetLines,
    toggleProduct,
    toggleBudgetLine,
    openProduct,
  } = useBudgetExpansion()
  const focusedProductRef = useRef<HTMLTableRowElement | null>(null)
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products),
    [categories],
  )
  const categoryCards = useMemo<CategoryNavigationCard[]>(() => {
    const allSelectedBudget = categories.reduce(
      (total, category) => total + category.selected_budget_amount_ttc,
      0,
    )
    const allActualCost = categories.reduce(
      (total, category) => total + category.actual_cost_amount_ttc,
      0,
    )

    return [
      {
        id: ALL_CATEGORIES_ID,
        name: 'Toutes les catégories',
        productCount: allProducts.length,
        selectedBudgetAmountTtc: allSelectedBudget,
        actualCostAmountTtc: allActualCost,
        varianceTtc: allSelectedBudget - allActualCost,
        icon: Layers3,
      },
      ...categories.map((category) => ({
        id: category.category_id,
        name: category.category_name,
        productCount: category.products.length,
        selectedBudgetAmountTtc: category.selected_budget_amount_ttc,
        actualCostAmountTtc: category.actual_cost_amount_ttc,
        varianceTtc:
          category.selected_budget_amount_ttc - category.actual_cost_amount_ttc,
        icon: categoryIcons[category.category_name] ?? Hammer,
      })),
    ]
  }, [allProducts.length, categories])
  const selectedCategory =
    selectedCategoryId === ALL_CATEGORIES_ID
      ? null
      : categories.find(
          (category) => category.category_id === selectedCategoryId,
        )
  const categoryProducts = selectedCategory
    ? selectedCategory.products
    : allProducts
  const subcategoryGroups = useMemo(
    () => groupProductsBySubcategory(categoryProducts),
    [categoryProducts],
  )
  const visibleProducts = useMemo(() => {
    if (selectedSubcategoryName === ALL_SUBCATEGORIES_ID)
      return categoryProducts

    return categoryProducts.filter(
      (product) => product.subcategory_name === selectedSubcategoryName,
    )
  }, [categoryProducts, selectedSubcategoryName])

  useEffect(() => {
    if (
      selectedCategoryId !== ALL_CATEGORIES_ID &&
      !categories.some(
        (category) => category.category_id === selectedCategoryId,
      )
    ) {
      onSelectCategory(ALL_CATEGORIES_ID)
    }
  }, [categories, onSelectCategory, selectedCategoryId])

  useEffect(() => {
    if (
      selectedSubcategoryName !== ALL_SUBCATEGORIES_ID &&
      !subcategoryGroups.some((group) => group.name === selectedSubcategoryName)
    ) {
      onSelectSubcategory(ALL_SUBCATEGORIES_ID)
    }
  }, [onSelectSubcategory, selectedSubcategoryName, subcategoryGroups])

  useEffect(() => {
    if (!focusedProductId) return

    for (const category of categories) {
      for (const group of groupProductsBySubcategory(category.products)) {
        const product = group.products.find(
          (candidate) => candidate.product_id === focusedProductId,
        )
        if (product) {
          onSelectCategory(category.category_id)
          onSelectSubcategory(group.name)
          openProduct(product.product_id)
          window.setTimeout(() => {
            focusedProductRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
          }, 0)
          return
        }
      }
    }
  }, [
    categories,
    focusedProductId,
    onSelectCategory,
    onSelectSubcategory,
    openProduct,
  ])

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {categoryCards.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            isSelected={category.id === selectedCategoryId}
            onSelect={() => onSelectCategory(category.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
            selectedSubcategoryName === ALL_SUBCATEGORIES_ID
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary',
          )}
          onClick={() => onSelectSubcategory(ALL_SUBCATEGORIES_ID)}
          aria-pressed={selectedSubcategoryName === ALL_SUBCATEGORIES_ID}
        >
          Tous
        </button>
        {subcategoryGroups.map((group) => (
          <button
            key={group.name}
            type="button"
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              selectedSubcategoryName === group.name
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary',
            )}
            onClick={() => onSelectSubcategory(group.name)}
            aria-pressed={selectedSubcategoryName === group.name}
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableBody>
            {visibleProducts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="px-4 py-6 text-sm text-muted-foreground"
                >
                  Aucun produit dans cette sélection.
                </TableCell>
              </TableRow>
            ) : (
              visibleProducts.map((product) => {
                const isProductOpen = openProducts.has(product.product_id)
                const wholeProductLine = getWholeProductBudgetLine(product)
                const selectedWholeProductLine = wholeProductLine
                  ? getLineWithBudgetSelection(wholeProductLine)
                  : null
                const isEmptyProduct = isProductEmpty(product)

                return (
                  <Fragment key={product.product_id}>
                    <ProductRow
                      ref={
                        focusedProductId === product.product_id
                          ? focusedProductRef
                          : undefined
                      }
                      product={product}
                      isFocused={focusedProductId === product.product_id}
                      isOpen={isProductOpen}
                      onToggle={() => toggleProduct(product.product_id)}
                    />
                    {isProductOpen ? (
                      isEmptyProduct ? (
                        <EmptyProductRow
                          product={product}
                          readOnly={readOnly}
                          onAddFirstTransaction={onAddFirstTransaction}
                        />
                      ) : (
                        <>
                          <ProductContextRows
                            product={product}
                            line={selectedWholeProductLine}
                            readOnly={readOnly}
                            onAddBreakdown={onAddBreakdown}
                            onAddTransaction={onAddTransaction}
                            onDecomposeProduct={onDecomposeProduct}
                          />
                          {selectedWholeProductLine ? (
                            <TransactionsPanel
                              transactions={
                                selectedWholeProductLine.transactions
                              }
                              budgetLine={selectedWholeProductLine}
                              budgetSelection={getBudgetSelection(
                                selectedWholeProductLine,
                              )}
                              projectId={projectId}
                              product={product}
                              readOnly={readOnly}
                              onToggleBudgetSelection={onToggleBudgetSelection}
                              onRequestDeleteTransaction={
                                onRequestDeleteTransaction
                              }
                              onEditTransaction={onEditTransaction}
                              onViewTransaction={onViewTransaction}
                              onViewTransactionDocuments={
                                onViewTransactionDocuments
                              }
                            />
                          ) : (
                            product.budget_lines.map((line) => {
                              const isLineOpen = openBudgetLines.has(
                                line.budget_line_id,
                              )
                              const selectedLine =
                                getLineWithBudgetSelection(line)

                              return (
                                <Fragment key={line.budget_line_id}>
                                  <BudgetLineRow
                                    line={selectedLine}
                                    product={product}
                                    isOpen={isLineOpen}
                                    readOnly={readOnly}
                                    onRequestDelete={onRequestDeleteBudgetLine}
                                    onToggle={() =>
                                      toggleBudgetLine(line.budget_line_id)
                                    }
                                  />
                                  {isLineOpen ? (
                                    <>
                                      <BudgetLineContextRow
                                        line={selectedLine}
                                        product={product}
                                        readOnly={readOnly}
                                        onAddTransaction={onAddTransaction}
                                      />
                                      <TransactionsPanel
                                        transactions={selectedLine.transactions}
                                        budgetLine={selectedLine}
                                        budgetSelection={getBudgetSelection(
                                          selectedLine,
                                        )}
                                        projectId={projectId}
                                        product={product}
                                        readOnly={readOnly}
                                        onToggleBudgetSelection={
                                          onToggleBudgetSelection
                                        }
                                        onRequestDeleteTransaction={
                                          onRequestDeleteTransaction
                                        }
                                        onEditTransaction={onEditTransaction}
                                        onViewTransaction={onViewTransaction}
                                        onViewTransactionDocuments={
                                          onViewTransactionDocuments
                                        }
                                      />
                                    </>
                                  ) : null}
                                </Fragment>
                              )
                            })
                          )}
                        </>
                      )
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
