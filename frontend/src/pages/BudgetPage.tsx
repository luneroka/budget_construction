import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, FilePlus2, Layers3, Plus } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  budgetLine: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
}

type BreakdownAction = {
  product: ProductSummaryViewModel
}

type ActiveAction =
  | ({ kind: 'transaction' } & TransactionAction)
  | ({ kind: 'breakdown' } & BreakdownAction)

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
      className="flex w-full flex-col gap-3 bg-primary px-4 py-3 text-left text-primary-foreground transition-colors hover:bg-primary/95 sm:flex-row sm:items-center sm:justify-between"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span className="flex min-w-0 items-center gap-2">
        <ToggleIcon isOpen={isOpen} />
        <span>
          <span className="block font-heading text-lg font-semibold">
            {category.category_name}
          </span>
          <span className="mt-0.5 block text-xs text-primary-foreground/75">
            {category.products.length} produits
          </span>
        </span>
      </span>
      <span className="grid w-full grid-cols-3 gap-3 text-right text-xs sm:w-auto sm:gap-5">
        <span>
          <span className="block text-primary-foreground/65">Budget</span>
          <span className="font-semibold">
            {formatCurrency(category.selected_budget_amount_ttc)}
          </span>
        </span>
        <span>
          <span className="block text-primary-foreground/65">Facturé</span>
          <span className="font-semibold">
            {formatCurrency(category.actual_cost_amount_ttc)}
          </span>
        </span>
        <span>
          <span className="block text-primary-foreground/65">Écart</span>
          <span className="font-semibold">{formatCurrency(variance)}</span>
        </span>
      </span>
    </button>
  )
}

function ProductContextRows({
  product,
  line,
  onAddBreakdown,
  onAddTransaction,
}: {
  product: ProductSummaryViewModel
  line: BudgetLineSummaryViewModel | null
  onAddBreakdown: (action: BreakdownAction) => void
  onAddTransaction: (action: TransactionAction) => void
}) {
  const supportsBreakdowns = line === null

  return (
    <TableRow className="border-t-0 bg-card hover:!bg-card">
      <TableCell colSpan={7} className="px-6 py-2">
        <div className="flex items-center justify-between border-t border-border/50 pt-2 pl-7">
          <span className="text-xs text-muted-foreground">
            {supportsBreakdowns
              ? 'Produit décomposé en postes de budget'
              : 'Transactions rattachées directement au produit'}
          </span>
          {supportsBreakdowns ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground hover:!bg-gold/15 hover:!text-gold"
              onClick={() => onAddBreakdown({ product })}
            >
              <Layers3 aria-hidden="true" />
              Ajouter un sous-produit
            </Button>
          ) : line ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-muted-foreground hover:!bg-gold/15 hover:!text-gold"
              onClick={() => onAddTransaction({ budgetLine: line, product })}
            >
              <Plus aria-hidden="true" />
              Ajouter une transaction
            </Button>
          ) : null}
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
    <TableRow className="border-t-0 bg-muted/25 hover:!bg-muted/25">
      <TableCell colSpan={7} className="px-6 py-2">
        <div className="flex items-center justify-between border-t border-border/50 pt-2 pl-20">
          <span className="text-xs text-muted-foreground">
            Transactions de ce poste de budget
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground hover:!bg-gold/15 hover:!text-gold"
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
          className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            <ToggleIcon isOpen={isOpen} />
            <div>
              <p className="font-heading text-base font-semibold text-foreground">
                {group.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{group.products.length} produits</span>
            <span>
              Budget {formatCurrency(group.selected_budget_amount_ttc)}
            </span>
            <span>Facturé {formatCurrency(group.actual_cost_amount_ttc)}</span>
            <span className={varianceClass(group.selected_budget_variance_ttc)}>
              Écart {formatCurrency(group.selected_budget_variance_ttc)}
            </span>
          </div>
        </button>
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
  level = 'product',
}: {
  transactions: TransactionViewModel[]
  onAddTransaction: () => void
  level?: 'product' | 'breakdown'
}) {
  return (
    <TableRow className="border-t-0 bg-muted/10 hover:!bg-muted/10">
      <TableCell colSpan={7} className="p-0">
        <div
          className={cn('py-2 pr-6', level === 'breakdown' ? 'pl-20' : 'pl-14')}
        >
          <div className="bg-background/70">
            <Table className="text-xs">
              <TableHeader className="bg-transparent">
                <TableRow className="border-t-0 border-border/50 hover:!bg-transparent">
                  <TableHead className="whitespace-nowrap px-3 py-2 text-[11px] uppercase text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2 text-[11px] uppercase text-muted-foreground">
                    Type
                  </TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2 text-[11px] uppercase text-muted-foreground">
                    Fournisseur
                  </TableHead>
                  <TableHead className="min-w-80 px-3 py-2 text-[11px] uppercase text-muted-foreground">
                    Description
                  </TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2 text-right text-[11px] uppercase text-muted-foreground">
                    Montant TTC
                  </TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2 text-[11px] uppercase text-muted-foreground">
                    Statut devis
                  </TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2 text-[11px] uppercase text-muted-foreground">
                    Statut facture
                  </TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2 text-[11px] uppercase text-muted-foreground">
                    Document
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow
                    key={transaction.id}
                    className="border-border/40 hover:!bg-transparent"
                  >
                    <TableCell className="whitespace-nowrap px-3 py-2">
                      {formatDate(transaction.issued_date)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2">
                      <StatusBadge status={transaction.transaction_type} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2">
                      {transaction.supplier_name ?? 'Autoconstruction'}
                    </TableCell>
                    <TableCell className="min-w-80 px-3 py-2">
                      {transaction.description}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {formatCurrency(transaction.amount_ttc)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2">
                      {transaction.quote_status ? (
                        <StatusBadge status={transaction.quote_status} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2">
                      {transaction.invoice_status ? (
                        <StatusBadge status={transaction.invoice_status} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2">
                      <StatusBadge status={transaction.document_state} />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-border/40 hover:!bg-transparent">
                  <TableCell colSpan={8} className="px-3 py-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
                      onClick={onAddTransaction}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Ajouter une transaction
                    </button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
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
  const [selectedTransactionType, setSelectedTransactionType] =
    useState<TransactionType>('quote')

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

  return (
    <section>
      <PageHeader
        eyebrow="Workspace"
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
                  <TableHeader>
                    <TableRow>
                      <TableHead>Élément</TableHead>
                      <TableHead className="text-right">Budget</TableHead>
                      <TableHead className="text-right">DIY</TableHead>
                      <TableHead className="text-right">Facturé</TableHead>
                      <TableHead className="text-right">Payé</TableHead>
                      <TableHead className="text-right">À payer</TableHead>
                      <TableHead className="text-right">Écart</TableHead>
                    </TableRow>
                  </TableHeader>
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
                          {isSubcategoryOpen
                            ? group.products.map((product) => {
                                const isProductOpen = openProducts.has(
                                  product.product_id,
                                )
                                const wholeProductLine =
                                  getWholeProductBudgetLine(product)

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
                                        />
                                        {wholeProductLine ? (
                                          <TransactionsRows
                                            transactions={
                                              wholeProductLine.transactions
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
                                                      level="breakdown"
                                                      transactions={
                                                        line.transactions
                                                      }
                                                      onAddTransaction={() =>
                                                        openTransactionAction({
                                                          budgetLine: line,
                                                          product,
                                                        })
                                                      }
                                                    />
                                                  </>
                                                ) : null}
                                              </Fragment>
                                            )
                                          })
                                        )}
                                      </>
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
                  {activeAction.kind === 'transaction'
                    ? 'Ajouter une transaction'
                    : 'Ajouter un sous-produit'}
                </p>
                {activeAction.kind === 'transaction' ? (
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
                      Action de démonstration depuis la ligne «{' '}
                      {activeAction.budgetLine.name} » du produit «{' '}
                      {activeAction.product.product_name} ». Le formulaire
                      compatible backend arrive au Chunk 7.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Action de démonstration pour ajouter un poste de budget au
                    produit « {activeAction.product.product_name} ». Le
                    formulaire compatible backend arrive au Chunk 7.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setActiveAction(null)}>Fermer</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
