import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Hammer, Layers3, type LucideIcon } from 'lucide-react'

import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import {
  BudgetLineContextRow,
  BudgetLineRow,
  ProductContextRows,
  ProductRow,
} from '@/components/budget/BudgetTreeRows'
import {
  EmptyTransactionsPanel,
  TransactionsPanel,
} from '@/components/budget/TransactionsPanel'
import { categoryIcons } from '@/components/budget/budgetCategoryIcons'
import type {
  BudgetLineDeleteState,
  BreakdownAction,
  TransactionAction,
} from '@/components/budget/types'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { BudgetCategory, BudgetLine, Product, Transaction } from '@/types'
import { useBudgetExpansion } from '@/hooks/useBudgetExpansion'
import {
  getWholeProductBudgetLine,
  groupProductsBySubcategory,
  isProductEmpty,
  varianceClass,
} from '@/lib/budgetDomain'
import { formatCurrency } from '@/lib/format'
import {
  highlightSearchMatches,
  normalizeSearchText,
} from '@/lib/searchHighlight'
import { cn } from '@/lib/utils'

type BudgetTreeProps = {
  categories: BudgetCategory[]
  selectedCategoryId: string
  selectedSubcategoryName: string
  projectId?: number
  focusedProductId?: string | null
  readOnly?: boolean
  onAddBreakdown: (action: BreakdownAction) => void
  onAddTransaction: (action: TransactionAction) => void
  onDecomposeProduct: (action: BreakdownAction) => void
  onToggleBudgetSelection: (line: BudgetLine, transaction: Transaction) => void
  onRequestDeleteBudgetLine: (context: BudgetLineDeleteState) => void
  onRequestDeleteTransaction: (context: ViewedTransactionContext) => void
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

function productMatchesSearch(product: Product, normalizedSearch: string) {
  if (!normalizedSearch) return true

  const searchableValues = [
    product.product_name,
    ...product.budget_lines.map((line) => line.name),
  ]

  return searchableValues.some((value) =>
    normalizeSearchText(value).includes(normalizedSearch),
  )
}

function ProductSearchBreadcrumb({
  product,
  searchQuery,
}: {
  product: Product
  searchQuery: string
}) {
  return (
    <TableRow className="border-b-0 bg-muted/20">
      <TableCell colSpan={7} className="pt-2 pb-0">
        <div className="text-[0.7rem] font-medium tracking-wide text-muted-foreground">
          <span>
            {highlightSearchMatches(product.category_name, searchQuery)}
          </span>
          <span className="mx-1.5 text-muted-foreground/60">›</span>
          <span>
            {highlightSearchMatches(product.subcategory_name, searchQuery)}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}

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
  const labelClass = isSelected
    ? 'text-primary-foreground/65'
    : 'text-muted-foreground'

  return (
    <button
      type="button"
      className={cn(
        'rounded-lg border px-2.5 py-2 text-left transition-colors',
        isSelected
          ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/95'
          : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-primary/5',
      )}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            isSelected
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'bg-primary/10 text-primary',
          )}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-5">
            {category.name}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-medium',
            isSelected
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {category.productCount}
        </span>
      </div>
      <div
        className={cn(
          'mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t pt-1.5 text-[0.7rem] leading-4',
          isSelected ? 'border-primary-foreground/25' : 'border-border/60',
        )}
      >
        <span className="min-w-0">
          <span className={cn('block', labelClass)}>Budget</span>
          <span className="block truncate font-semibold">
            {formatCurrency(category.selectedBudgetAmountTtc)}
          </span>
        </span>
        <span className="min-w-0">
          <span className={cn('block', labelClass)}>Facturé</span>
          <span className="block truncate font-semibold">
            {formatCurrency(category.actualCostAmountTtc)}
          </span>
        </span>
        <span className="min-w-0 text-right">
          <span className={cn('block', labelClass)}>Écart</span>
          <span
            className={cn(
              'block truncate font-semibold',
              !isSelected && varianceClass(category.varianceTtc),
            )}
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
  focusedProductId,
  projectId,
  readOnly,
  onAddBreakdown,
  onAddTransaction,
  onDecomposeProduct,
  onToggleBudgetSelection,
  onRequestDeleteBudgetLine,
  onRequestDeleteTransaction,
  onViewTransaction,
  onViewTransactionDocuments,
  onSelectCategory,
  onSelectSubcategory,
}: BudgetTreeProps) {
  const {
    openProductId,
    openBudgetLineId,
    toggleProduct,
    toggleBudgetLine,
    openProduct,
    closeBudgetLines,
    collapseAllProducts,
  } = useBudgetExpansion()
  const appliedFocusRef = useRef<string | null>(null)
  const openProductBodyRef = useRef<HTMLTableSectionElement | null>(null)
  const pendingScrollRef = useRef<string | null>(null)
  const [productSearch, setProductSearch] = useState('')
  // Search results are an accordion of their own, reset with each query.
  const [searchOpenProductId, setSearchOpenProductId] = useState<string | null>(
    null,
  )
  const normalizedProductSearch = useMemo(
    () => normalizeSearchText(productSearch),
    [productSearch],
  )
  const isSearchActive = normalizedProductSearch.length > 0
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
  const filteredProducts = useMemo(() => {
    if (selectedSubcategoryName === ALL_SUBCATEGORIES_ID)
      return categoryProducts

    return categoryProducts.filter(
      (product) => product.subcategory_name === selectedSubcategoryName,
    )
  }, [categoryProducts, selectedSubcategoryName])
  const visibleProducts = useMemo(
    () =>
      filteredProducts.filter((product) =>
        productMatchesSearch(product, normalizedProductSearch),
      ),
    [filteredProducts, normalizedProductSearch],
  )
  const visibleTotals = useMemo(
    () =>
      visibleProducts.reduce(
        (totals, product) => ({
          selected_budget_amount_ttc:
            totals.selected_budget_amount_ttc +
            product.selected_budget_amount_ttc,
          actual_cost_amount_ttc:
            totals.actual_cost_amount_ttc + product.actual_cost_amount_ttc,
        }),
        { selected_budget_amount_ttc: 0, actual_cost_amount_ttc: 0 },
      ),
    [visibleProducts],
  )
  const visibleVariance =
    visibleTotals.selected_budget_amount_ttc -
    visibleTotals.actual_cost_amount_ttc

  useEffect(() => {
    setSearchOpenProductId(null)
  }, [normalizedProductSearch])

  const openProductIdInView = isSearchActive
    ? searchOpenProductId
    : openProductId

  // Opening a product collapses the one that was open, and with it the
  // sub-products expanded under it, as closing it by hand does.
  function toggleProductRow(product: Product) {
    const wasOpen = allProducts.find(
      (candidate) => candidate.product_id === openProductIdInView,
    )
    if (wasOpen) {
      closeBudgetLines(wasOpen.budget_lines.map((line) => line.budget_line_id))
    }
    if (openProductIdInView !== product.product_id) {
      pendingScrollRef.current = product.product_id
    }
    if (isSearchActive) {
      setSearchOpenProductId((current) =>
        current === product.product_id ? null : product.product_id,
      )
    } else {
      toggleProduct(product.product_id)
    }
  }

  function handleSelectCategory(categoryId: string) {
    collapseAllProducts()
    setSearchOpenProductId(null)
    onSelectCategory(categoryId)
  }

  function handleSelectSubcategory(subcategoryName: string) {
    collapseAllProducts()
    setSearchOpenProductId(null)
    onSelectSubcategory(subcategoryName)
  }

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

  // Applied once per focus request (a dashboard alert link), not again on
  // every refetch of `categories`: that would re-open the focused product and
  // collapse whichever one the user has opened since.
  useEffect(() => {
    if (!focusedProductId || appliedFocusRef.current === focusedProductId) {
      return
    }

    for (const category of categories) {
      for (const group of groupProductsBySubcategory(category.products)) {
        const product = group.products.find(
          (candidate) => candidate.product_id === focusedProductId,
        )
        if (product) {
          appliedFocusRef.current = focusedProductId
          onSelectCategory(category.category_id)
          onSelectSubcategory(group.name)
          collapseAllProducts()
          openProduct(product.product_id)
          pendingScrollRef.current = product.product_id
          return
        }
      }
    }
  }, [
    categories,
    collapseAllProducts,
    focusedProductId,
    onSelectCategory,
    onSelectSubcategory,
    openProduct,
  ])

  // Opening a product (a click, or a dashboard alert link) recentres the
  // page on it: the product that collapses above it could otherwise pull it
  // out of view. A block taller than the screen is aligned at the top instead.
  // Its transactions load after it opens, so it is recentred as it grows for
  // a moment, and never again once the user starts working in it.
  useEffect(() => {
    const productId = pendingScrollRef.current
    const body = openProductBodyRef.current
    if (!productId || productId !== openProductIdInView || !body) return
    pendingScrollRef.current = null
    const recentre = () => {
      const fitsOnScreen =
        body.getBoundingClientRect().height < window.innerHeight - 96
      body.scrollIntoView({
        behavior: 'smooth',
        block: fitsOnScreen ? 'center' : 'start',
      })
    }
    const observer = new ResizeObserver(recentre)
    observer.observe(body)
    const stop = window.setTimeout(() => observer.disconnect(), 1500)
    return () => {
      observer.disconnect()
      window.clearTimeout(stop)
    }
  }, [openProductIdInView])

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {categoryCards.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            isSelected={category.id === selectedCategoryId}
            onSelect={() => handleSelectCategory(category.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            'h-10 rounded-full border px-3 text-base font-normal transition-colors',
            selectedSubcategoryName === ALL_SUBCATEGORIES_ID
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary',
          )}
          onClick={() => handleSelectSubcategory(ALL_SUBCATEGORIES_ID)}
          aria-pressed={selectedSubcategoryName === ALL_SUBCATEGORIES_ID}
        >
          Tous
        </button>
        {subcategoryGroups.map((group) => (
          <button
            key={group.name}
            type="button"
            className={cn(
              'h-10 rounded-full border px-3 text-base font-normal transition-colors',
              selectedSubcategoryName === group.name
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/60 hover:text-primary',
            )}
            onClick={() => handleSelectSubcategory(group.name)}
            aria-pressed={selectedSubcategoryName === group.name}
          >
            {group.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm min-w-48 flex-1">
          <label className="sr-only" htmlFor="budget-product-search">
            Rechercher un produit
          </label>
          <Input
            id="budget-product-search"
            type="search"
            value={productSearch}
            placeholder="Rechercher un produit..."
            onChange={(event) => setProductSearch(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-[7.25rem_7.25rem_7.25rem] items-center gap-x-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
          <span className="text-right">
            <span className="block text-muted-foreground">Budget</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(visibleTotals.selected_budget_amount_ttc)}
            </span>
          </span>
          <span className="text-right">
            <span className="block text-muted-foreground">Facturé</span>
            <span className="font-semibold text-foreground">
              {formatCurrency(visibleTotals.actual_cost_amount_ttc)}
            </span>
          </span>
          <span className="text-right">
            <span className="block text-muted-foreground">Écart</span>
            <span
              className={cn('font-semibold', varianceClass(visibleVariance))}
            >
              {formatCurrency(visibleVariance)}
            </span>
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          {visibleProducts.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-6 text-sm text-muted-foreground"
                >
                  {isSearchActive
                    ? 'Aucun produit ne correspond à votre recherche.'
                    : 'Aucun produit dans cette sélection.'}
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            visibleProducts.map((product) => {
              const isProductOpen = openProductIdInView === product.product_id
              const selectedWholeProductLine =
                getWholeProductBudgetLine(product)
              const isEmptyProduct = isProductEmpty(product)

              // Each product is its own row group, so the open one can be
              // outlined whole, sub-products included.
              return (
                <TableBody
                  key={product.product_id}
                  ref={isProductOpen ? openProductBodyRef : undefined}
                  className={cn(
                    isProductOpen &&
                      'scroll-mt-20 outline-2 -outline-offset-2 outline-gold min-[1600px]:scroll-mt-4',
                  )}
                >
                  {isSearchActive ? (
                    <ProductSearchBreadcrumb
                      product={product}
                      searchQuery={productSearch}
                    />
                  ) : null}
                  <ProductRow
                    product={product}
                    isFocused={focusedProductId === product.product_id}
                    isOpen={isProductOpen}
                    searchQuery={isSearchActive ? productSearch : ''}
                    onToggle={() => toggleProductRow(product)}
                  />
                  {isProductOpen ? (
                    isEmptyProduct ? (
                      <>
                        <ProductContextRows
                          product={product}
                          line={null}
                          isEmpty
                          readOnly={readOnly}
                          onAddBreakdown={onAddBreakdown}
                          onDecomposeProduct={onDecomposeProduct}
                        />
                        <EmptyTransactionsPanel
                          product={product}
                          readOnly={readOnly}
                          onAddTransaction={onAddTransaction}
                        />
                      </>
                    ) : (
                      <>
                        <ProductContextRows
                          product={product}
                          line={selectedWholeProductLine}
                          readOnly={readOnly}
                          onAddBreakdown={onAddBreakdown}
                          onDecomposeProduct={onDecomposeProduct}
                        />
                        {selectedWholeProductLine ? (
                          <TransactionsPanel
                            transactions={selectedWholeProductLine.transactions}
                            budgetLine={selectedWholeProductLine}
                            projectId={projectId}
                            product={product}
                            readOnly={readOnly}
                            onToggleBudgetSelection={onToggleBudgetSelection}
                            onRequestDeleteTransaction={
                              onRequestDeleteTransaction
                            }
                            onViewTransaction={onViewTransaction}
                            onViewTransactionDocuments={
                              onViewTransactionDocuments
                            }
                            onAddTransaction={onAddTransaction}
                          />
                        ) : (
                          product.budget_lines.map((line) => {
                            const isLineOpen =
                              openBudgetLineId === line.budget_line_id

                            return (
                              <Fragment key={line.budget_line_id}>
                                <BudgetLineRow
                                  line={line}
                                  product={product}
                                  isOpen={isLineOpen}
                                  readOnly={readOnly}
                                  searchQuery={
                                    isSearchActive ? productSearch : ''
                                  }
                                  onRequestDelete={onRequestDeleteBudgetLine}
                                  onToggle={() =>
                                    toggleBudgetLine(line.budget_line_id)
                                  }
                                />
                                {isLineOpen ? (
                                  <>
                                    <BudgetLineContextRow />
                                    <TransactionsPanel
                                      transactions={line.transactions}
                                      budgetLine={line}
                                      projectId={projectId}
                                      product={product}
                                      readOnly={readOnly}
                                      onToggleBudgetSelection={
                                        onToggleBudgetSelection
                                      }
                                      onRequestDeleteTransaction={
                                        onRequestDeleteTransaction
                                      }
                                      onViewTransaction={onViewTransaction}
                                      onViewTransactionDocuments={
                                        onViewTransactionDocuments
                                      }
                                      onAddTransaction={onAddTransaction}
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
                </TableBody>
              )
            })
          )}
        </Table>
      </div>
    </div>
  )
}
