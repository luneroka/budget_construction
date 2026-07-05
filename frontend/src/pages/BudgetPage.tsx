import { Fragment, useMemo, useState } from 'react'
import {
  ChevronDown,
  Eye,
  FilePlus2,
  Layers3,
  Paperclip,
  Plus,
} from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { budgetWorkspaceViewModel } from '@/demo/demo-data'
import type {
  BudgetCategoryViewModel,
  BudgetLineSummaryViewModel,
  ProductSummaryViewModel,
  TransactionType,
  TransactionViewModel,
} from '@/demo/types'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type TransactionAction = {
  budgetLine?: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
  initialStructure?: ProductStructureChoice
}

type BreakdownAction = {
  product: ProductSummaryViewModel
}

type ProductStructureChoice = 'single' | 'breakdown'

type ActiveAction =
  | ({ kind: 'transaction' } & TransactionAction)
  | ({ kind: 'breakdown' } & BreakdownAction)
  | ({ kind: 'decompose-product' } & BreakdownAction)
  | ({ kind: 'structure-choice' } & BreakdownAction)

const transactionTypeLabels: Record<TransactionType, string> = {
  quote: 'Devis',
  diy_estimate: 'Estimation DIY',
  invoice: 'Facture',
}

function sumBudgetLines(
  product: ProductSummaryViewModel,
  key: keyof Pick<BudgetLineSummaryViewModel, 'diy_estimate_amount_ttc'>,
) {
  return product.budget_lines.reduce((total, line) => total + line[key], 0)
}

function varianceClass(value: number) {
  if (value < 0) return 'text-destructive'
  if (value > 0) return 'text-success'
  return 'text-muted-foreground'
}

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

type SubcategoryGroup = {
  name: string
  products: ProductSummaryViewModel[]
  selected_budget_amount_ttc: number
  actual_cost_amount_ttc: number
  paid_invoice_amount_ttc: number
  unpaid_invoice_amount_ttc: number
  selected_budget_variance_ttc: number
}

function groupProductsBySubcategory(
  products: ProductSummaryViewModel[],
): SubcategoryGroup[] {
  const groups = new Map<string, ProductSummaryViewModel[]>()

  products.forEach((product) => {
    const currentProducts = groups.get(product.subcategory_name) ?? []
    currentProducts.push(product)
    groups.set(product.subcategory_name, currentProducts)
  })

  return [...groups.entries()].map(([name, groupProducts]) => ({
    name,
    products: groupProducts,
    selected_budget_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.selected_budget_amount_ttc,
      0,
    ),
    actual_cost_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.actual_cost_amount_ttc,
      0,
    ),
    paid_invoice_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.paid_invoice_amount_ttc,
      0,
    ),
    unpaid_invoice_amount_ttc: groupProducts.reduce(
      (total, product) => total + product.unpaid_invoice_amount_ttc,
      0,
    ),
    selected_budget_variance_ttc: groupProducts.reduce(
      (total, product) => total + product.selected_budget_variance_ttc,
      0,
    ),
  }))
}

function getWholeProductBudgetLine(product: ProductSummaryViewModel) {
  const [line] = product.budget_lines
  return product.budget_lines.length === 1 && line?.item_type === 'product'
    ? line
    : null
}

function isProductEmpty(product: ProductSummaryViewModel) {
  return (
    product.budget_lines.length === 0 ||
    product.budget_lines.every(
      (line) =>
        line.transactions.length === 0 &&
        line.selected_budget_amount_ttc === 0 &&
        line.actual_cost_amount_ttc === 0 &&
        line.diy_estimate_amount_ttc === 0,
    )
  )
}

function CategoryHeader({
  category,
  isOpen,
  onToggle,
}: {
  category: BudgetCategoryViewModel
  isOpen: boolean
  onToggle: () => void
}) {
  const variance =
    category.selected_budget_amount_ttc - category.actual_cost_amount_ttc

  return (
    <button
      type="button"
      className="grid w-full grid-cols-1 gap-y-3 bg-primary px-4 py-3 text-left text-primary-foreground transition-colors hover:bg-primary/95 sm:grid-cols-[minmax(18rem,1fr)_4.75rem_7.25rem_7.25rem_7.25rem] sm:items-center sm:gap-x-1"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span className="flex min-w-0 items-center gap-2 sm:col-span-2">
        <ToggleIcon isOpen={isOpen} />
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

function ProductContextRows({
  product,
  line,
  onAddBreakdown,
  onAddTransaction,
  onDecomposeProduct,
}: {
  product: ProductSummaryViewModel
  line: BudgetLineSummaryViewModel | null
  onAddBreakdown: (action: BreakdownAction) => void
  onAddTransaction: (action: TransactionAction) => void
  onDecomposeProduct: (action: BreakdownAction) => void
}) {
  const supportsBreakdowns = line === null

  return (
    <TableRow className="border-t-0 bg-card hover:bg-card!">
      <TableCell colSpan={7} className="px-6 pt-1 pb-0">
        <div className="flex items-center justify-between border-t border-border/50 pt-1 pl-4">
          <span className="text-xs text-muted-foreground">
            {supportsBreakdowns
              ? 'Produit décomposé en sous-produits'
              : 'Transactions rattachées directement au produit'}
          </span>
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
        </div>
      </TableCell>
    </TableRow>
  )
}

function EmptyProductRow({
  product,
  onAddFirstTransaction,
}: {
  product: ProductSummaryViewModel
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
              Commencez par ajouter une première transaction pour ce produit.
            </p>
          </div>
          <Button
            size="sm"
            variant="gold"
            onClick={() => onAddFirstTransaction({ product })}
          >
            <Plus aria-hidden="true" />
            Ajouter une première transaction
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function BudgetLineContextRow({
  line,
  product,
  onAddTransaction,
}: {
  line: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
  onAddTransaction: (action: TransactionAction) => void
}) {
  return (
    <TableRow className="border-t-0 bg-muted/25 hover:bg-muted/25!">
      <TableCell colSpan={7} className="px-6 pt-1 pb-0">
        <div className="flex items-center justify-between border-t border-border/50 pt-1 pl-16">
          <span className="text-xs text-muted-foreground">
            Transactions de ce poste de budget
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground hover:bg-gold/15! hover:text-gold!"
            onClick={() => onAddTransaction({ budgetLine: line, product })}
          >
            <Plus aria-hidden="true" />
            Ajouter une transaction
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function SubcategoryRow({
  group,
  isOpen,
  onToggle,
}: {
  group: SubcategoryGroup
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <TableRow className="bg-muted/70 hover:bg-muted/70">
      <TableCell colSpan={7} className="px-4 py-2">
        <button
          type="button"
          className="grid w-full grid-cols-1 gap-y-2 text-left sm:grid-cols-[minmax(18rem,1fr)_4.75rem_7.25rem_7.25rem_7.25rem] sm:items-center sm:gap-x-1"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ToggleIcon isOpen={isOpen} />
            <div>
              <p className="truncate text-base font-semibold text-foreground">
                {group.name}
              </p>
            </div>
          </div>
          <span className="whitespace-nowrap text-right text-xs text-muted-foreground">
            {group.products.length} produits
          </span>
          <span className="whitespace-nowrap text-right text-xs text-muted-foreground">
            Budget {formatCurrency(group.selected_budget_amount_ttc)}
          </span>
          <span className="whitespace-nowrap text-right text-xs text-muted-foreground">
            Facturé {formatCurrency(group.actual_cost_amount_ttc)}
          </span>
          <span
            className={cn(
              'whitespace-nowrap text-right text-xs',
              varianceClass(group.selected_budget_variance_ttc),
            )}
          >
            Écart {formatCurrency(group.selected_budget_variance_ttc)}
          </span>
        </button>
      </TableCell>
    </TableRow>
  )
}

function SubcategoryProductHeaderRow() {
  return (
    <TableRow className="bg-muted/35 hover:bg-muted/35!">
      <TableCell className="px-5 py-2 pl-6 text-xs font-semibold text-muted-foreground">
        Élément
      </TableCell>
      <TableCell className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground">
        Budget
      </TableCell>
      <TableCell className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground">
        DIY
      </TableCell>
      <TableCell className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground">
        Facturé
      </TableCell>
      <TableCell className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground">
        Payé
      </TableCell>
      <TableCell className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground">
        À payer
      </TableCell>
      <TableCell className="px-5 py-2 text-right text-xs font-semibold text-muted-foreground">
        Écart
      </TableCell>
    </TableRow>
  )
}

function ProductRow({
  product,
  isOpen,
  onToggle,
}: {
  product: ProductSummaryViewModel
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <TableRow className="bg-card hover:bg-muted/40">
      <TableCell className="min-w-72 pl-6">
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <ToggleIcon isOpen={isOpen} />
          <span className="block font-medium text-foreground">
            {product.product_name}
          </span>
        </button>
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatCurrency(product.selected_budget_amount_ttc)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(sumBudgetLines(product, 'diy_estimate_amount_ttc'))}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(product.actual_cost_amount_ttc)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(product.paid_invoice_amount_ttc)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(product.unpaid_invoice_amount_ttc)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-semibold',
          varianceClass(product.selected_budget_variance_ttc),
        )}
      >
        {formatCurrency(product.selected_budget_variance_ttc)}
      </TableCell>
    </TableRow>
  )
}

function BudgetLineRow({
  line,
  isOpen,
  onToggle,
}: {
  line: BudgetLineSummaryViewModel
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <TableRow className="bg-muted/25 hover:bg-muted/50">
      <TableCell className="min-w-72 pl-12">
        <button
          type="button"
          className="flex w-full items-center gap-3 text-left"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <ToggleIcon isOpen={isOpen} />
          <span
            className="h-7 w-1.5 rounded-full bg-gold/75"
            aria-hidden="true"
          />
          <span>
            <span className="block font-medium text-foreground">
              {line.name}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {line.transactions.length} transactions
            </span>
          </span>
        </button>
      </TableCell>
      <TableCell className="text-right font-medium">
        {formatCurrency(line.selected_budget_amount_ttc)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(line.diy_estimate_amount_ttc)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(line.actual_cost_amount_ttc)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(line.paid_invoice_amount_ttc)}
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(line.unpaid_invoice_amount_ttc)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-semibold',
          varianceClass(line.selected_budget_variance_ttc),
        )}
      >
        {formatCurrency(line.selected_budget_variance_ttc)}
      </TableCell>
    </TableRow>
  )
}

function TransactionsRows({
  transactions,
  onAddTransaction,
  onViewTransaction,
}: {
  transactions: TransactionViewModel[]
  onAddTransaction: () => void
  onViewTransaction: (transaction: TransactionViewModel) => void
}) {
  const transactionGridClass =
    'grid min-w-[44rem] grid-cols-[5rem_8rem_minmax(10rem,1fr)_7rem_6.25rem_4rem_4rem] items-center'

  return (
    <TableRow className="border-t-0 bg-muted/10 hover:bg-muted/10!">
      <TableCell colSpan={7} className="max-w-0 p-0">
        <div className="min-w-0 px-6 pb-2">
          <div className="w-full min-w-0 overflow-x-auto bg-background/70 text-xs">
            <div
              className={cn(transactionGridClass, 'border-t border-border/50')}
            >
              <div className="px-1.5 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Date
              </div>
              <div className="px-1.5 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Type
              </div>
              <div className="px-2 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Fournisseur
              </div>
              <div className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase">
                Montant TTC
              </div>
              <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Statut
              </div>
              <div className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
                Voir
              </div>
              <div className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
                Doc
              </div>
            </div>

            {transactions.map((transaction) => {
              const financialStatus =
                transaction.quote_status ?? transaction.invoice_status

              return (
                <div
                  key={transaction.id}
                  className={cn(
                    transactionGridClass,
                    'border-t border-border/40',
                  )}
                >
                  <div className="px-1.5 py-2 whitespace-nowrap">
                    {formatDate(transaction.issued_date)}
                  </div>
                  <div className="px-1.5 py-2 whitespace-nowrap">
                    <StatusBadge status={transaction.transaction_type} />
                  </div>
                  <div className="min-w-0 px-2 py-2 leading-snug wrap-break-words">
                    {transaction.supplier_name ?? 'Autoconstruction'}
                  </div>
                  <div className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    {formatCurrency(transaction.amount_ttc)}
                  </div>
                  <div className="px-3 py-2 whitespace-nowrap">
                    {financialStatus ? (
                      <StatusBadge status={financialStatus} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </div>
                  <div className="px-1 py-2 text-center whitespace-nowrap">
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
                      onClick={() => onViewTransaction(transaction)}
                      aria-label="Voir la transaction"
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="px-1 py-2 text-center whitespace-nowrap">
                    {transaction.document_state === 'attached' ? (
                      <Paperclip
                        className="mx-auto h-4 w-4 text-muted-foreground"
                        aria-label="Document joint"
                      />
                    ) : null}
                  </div>
                </div>
              )
            })}

            <div
              className={cn(transactionGridClass, 'border-t border-border/40')}
            >
              <div className="col-span-7 px-2 py-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
                  onClick={onAddTransaction}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Ajouter une transaction
                </button>
              </div>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function BudgetPage() {
  const { categories, financialSummary, project, transactions } =
    budgetWorkspaceViewModel
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(),
  )
  const [openSubcategories, setOpenSubcategories] = useState<Set<string>>(
    () => new Set(),
  )
  const [openProducts, setOpenProducts] = useState<Set<string>>(() => new Set())
  const [openBudgetLines, setOpenBudgetLines] = useState<Set<string>>(
    () => new Set(),
  )
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const [viewedTransaction, setViewedTransaction] =
    useState<TransactionViewModel | null>(null)
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<TransactionType>('quote')
  const [selectedStructureChoice, setSelectedStructureChoice] =
    useState<ProductStructureChoice>('single')

  const visibleCounts = useMemo(
    () => ({
      categories: categories.length,
      products: financialSummary.products.length,
      transactions: transactions.length,
    }),
    [categories.length, financialSummary.products.length, transactions.length],
  )

  function toggleSet(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) {
    setter((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openTransactionAction(action: TransactionAction) {
    setSelectedTransactionType('quote')
    setActiveAction({ kind: 'transaction', ...action })
  }

  function openStructureChoice(action: BreakdownAction) {
    setSelectedStructureChoice('single')
    setActiveAction({ kind: 'structure-choice', ...action })
  }

  function continueFromStructureChoice(action: BreakdownAction) {
    openTransactionAction({
      product: action.product,
      initialStructure: selectedStructureChoice,
    })
  }

  return (
    <section>
      <PageHeader
        title="Budget"
        description={`${project.name} · ${visibleCounts.categories} catégories, ${visibleCounts.products} produits et ${visibleCounts.transactions} transactions.`}
      />

      <div className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">Budget</p>
          <p className="mt-1 font-heading text-xl font-bold">
            {formatCurrency(financialSummary.selected_budget_amount_ttc)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">Facturé</p>
          <p className="mt-1 font-heading text-xl font-bold">
            {formatCurrency(financialSummary.actual_cost_amount_ttc)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">Payé</p>
          <p className="mt-1 font-heading text-xl font-bold text-success">
            {formatCurrency(financialSummary.paid_invoice_amount_ttc)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">Écart</p>
          <p
            className={cn(
              'mt-1 font-heading text-xl font-bold',
              varianceClass(financialSummary.selected_budget_variance_ttc),
            )}
          >
            {formatCurrency(financialSummary.selected_budget_variance_ttc)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((category) => {
          const isCategoryOpen = openCategories.has(category.category_id)
          const subcategoryGroups = groupProductsBySubcategory(
            category.products,
          )

          return (
            <div
              key={category.category_id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <CategoryHeader
                category={category}
                isOpen={isCategoryOpen}
                onToggle={() =>
                  toggleSet(setOpenCategories, category.category_id)
                }
              />
              {isCategoryOpen ? (
                <Table>
                  <TableBody>
                    {subcategoryGroups.map((group) => {
                      const subcategoryId = `${category.category_id}:${group.name}`
                      const isSubcategoryOpen =
                        openSubcategories.has(subcategoryId)

                      return (
                        <Fragment key={group.name}>
                          <SubcategoryRow
                            group={group}
                            isOpen={isSubcategoryOpen}
                            onToggle={() =>
                              toggleSet(setOpenSubcategories, subcategoryId)
                            }
                          />
                          {isSubcategoryOpen ? (
                            <SubcategoryProductHeaderRow />
                          ) : null}
                          {isSubcategoryOpen
                            ? group.products.map((product) => {
                                const isProductOpen = openProducts.has(
                                  product.product_id,
                                )
                                const wholeProductLine =
                                  getWholeProductBudgetLine(product)
                                const isEmptyProduct = isProductEmpty(product)

                                return (
                                  <Fragment key={product.product_id}>
                                    <ProductRow
                                      product={product}
                                      isOpen={isProductOpen}
                                      onToggle={() =>
                                        toggleSet(
                                          setOpenProducts,
                                          product.product_id,
                                        )
                                      }
                                    />
                                    {isProductOpen ? (
                                      isEmptyProduct ? (
                                        <EmptyProductRow
                                          product={product}
                                          onAddFirstTransaction={
                                            openStructureChoice
                                          }
                                        />
                                      ) : (
                                        <>
                                          <ProductContextRows
                                            product={product}
                                            line={wholeProductLine}
                                            onAddBreakdown={(action) =>
                                              setActiveAction({
                                                kind: 'breakdown',
                                                ...action,
                                              })
                                            }
                                            onAddTransaction={
                                              openTransactionAction
                                            }
                                            onDecomposeProduct={(action) =>
                                              setActiveAction({
                                                kind: 'decompose-product',
                                                ...action,
                                              })
                                            }
                                          />
                                          {wholeProductLine ? (
                                            <TransactionsRows
                                              transactions={
                                                wholeProductLine.transactions
                                              }
                                              onViewTransaction={
                                                setViewedTransaction
                                              }
                                              onAddTransaction={() =>
                                                openTransactionAction({
                                                  budgetLine: wholeProductLine,
                                                  product,
                                                })
                                              }
                                            />
                                          ) : (
                                            product.budget_lines.map((line) => {
                                              const isLineOpen =
                                                openBudgetLines.has(
                                                  line.budget_line_id,
                                                )

                                              return (
                                                <Fragment
                                                  key={line.budget_line_id}
                                                >
                                                  <BudgetLineRow
                                                    line={line}
                                                    isOpen={isLineOpen}
                                                    onToggle={() =>
                                                      toggleSet(
                                                        setOpenBudgetLines,
                                                        line.budget_line_id,
                                                      )
                                                    }
                                                  />
                                                  {isLineOpen ? (
                                                    <>
                                                      <BudgetLineContextRow
                                                        line={line}
                                                        product={product}
                                                        onAddTransaction={
                                                          openTransactionAction
                                                        }
                                                      />
                                                      <TransactionsRows
                                                        transactions={
                                                          line.transactions
                                                        }
                                                        onViewTransaction={
                                                          setViewedTransaction
                                                        }
                                                        onAddTransaction={() =>
                                                          openTransactionAction(
                                                            {
                                                              budgetLine: line,
                                                              product,
                                                            },
                                                          )
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
                            : null}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          )
        })}
      </div>

      {activeAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-foreground shadow-lg">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold/15 text-gold">
                <FilePlus2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-xl font-semibold">
                  {activeAction.kind === 'structure-choice'
                    ? 'Comment souhaitez-vous gérer ce produit ?'
                    : activeAction.kind === 'transaction'
                      ? 'Ajouter une transaction'
                      : activeAction.kind === 'decompose-product'
                        ? 'Décomposer le produit'
                        : 'Ajouter un sous-produit'}
                </p>
                {activeAction.kind === 'structure-choice' ? (
                  <>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Ce choix détermine l'organisation de vos postes de budget.
                      Vous pourrez le modifier ultérieurement.
                    </p>
                    <div className="mt-4 grid gap-2">
                      {(
                        [
                          {
                            value: 'single',
                            title: 'Un seul poste de budget',
                            description:
                              'Recommandé si vous souhaitez suivre le produit dans son ensemble.',
                          },
                          {
                            value: 'breakdown',
                            title: 'Plusieurs sous-produits',
                            description:
                              'Recommandé si vous souhaitez suivre plusieurs éléments séparément (ex. baie vitrée, fenêtre cuisine, fenêtre chambre...).',
                          },
                        ] satisfies Array<{
                          value: ProductStructureChoice
                          title: string
                          description: string
                        }>
                      ).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            'rounded-md border px-4 py-3 text-left transition-colors',
                            selectedStructureChoice === option.value
                              ? 'border-gold bg-gold/10'
                              : 'border-border bg-background hover:border-gold/60',
                          )}
                          onClick={() =>
                            setSelectedStructureChoice(option.value)
                          }
                        >
                          <span className="block font-medium text-foreground">
                            {option.title}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {option.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : activeAction.kind === 'transaction' ? (
                  <>
                    <div className="mt-4">
                      <label
                        htmlFor="transaction-type"
                        className="text-xs font-medium uppercase text-muted-foreground"
                      >
                        Type de transaction
                      </label>
                      <Select
                        id="transaction-type"
                        className="mt-1"
                        value={selectedTransactionType}
                        onChange={(event) =>
                          setSelectedTransactionType(
                            event.target.value as TransactionType,
                          )
                        }
                      >
                        {Object.entries(transactionTypeLabels).map(
                          ([type, label]) => (
                            <option key={type} value={type}>
                              {label}
                            </option>
                          ),
                        )}
                      </Select>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {activeAction.budgetLine ? (
                        <>
                          Action de démonstration depuis la ligne «{' '}
                          {activeAction.budgetLine.name} » du produit «{' '}
                          {activeAction.product.product_name} ».
                        </>
                      ) : (
                        <>
                          La première transaction créera{' '}
                          {activeAction.initialStructure === 'breakdown'
                            ? 'un premier sous-produit'
                            : 'un poste de budget unique'}{' '}
                          pour « {activeAction.product.product_name} ».
                        </>
                      )}{' '}
                      Le formulaire complet sera raccordé ultérieurement.
                    </p>
                  </>
                ) : activeAction.kind === 'decompose-product' ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Action de démonstration pour convertir le produit «{' '}
                    {activeAction.product.product_name} » en plusieurs
                    sous-produits. Cette conversion est déjà prévue dans le
                    modèle de budget.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Action de démonstration pour ajouter un sous-produit au
                    produit « {activeAction.product.product_name} ». Le
                    formulaire complet sera raccordé ultérieurement.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveAction(null)}>
                Fermer
              </Button>
              {activeAction.kind === 'structure-choice' ? (
                <Button
                  onClick={() => continueFromStructureChoice(activeAction)}
                >
                  Continuer
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {viewedTransaction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-foreground shadow-lg">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold/15 text-gold">
                <Eye className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-xl font-semibold">
                  Détails de la transaction
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Placeholder pour les détails de la transaction. Le contenu
                  complet sera raccordé ultérieurement.
                </p>
                <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {formatCurrency(viewedTransaction.amount_ttc)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {formatDate(viewedTransaction.issued_date)}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setViewedTransaction(null)}
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
