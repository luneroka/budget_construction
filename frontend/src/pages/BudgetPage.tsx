import { Fragment, useMemo, useState } from 'react'
import {
  ChevronDown,
  FilePlus2,
  Hammer,
  ReceiptText,
  ScrollText,
} from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
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
  type: TransactionType
  budgetLine: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
}

const transactionActionLabels: Record<TransactionType, string> = {
  quote: 'Ajouter un devis',
  diy_estimate: 'Ajouter une estimation DIY',
  invoice: 'Ajouter une facture',
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

function TransactionActionButtons({
  line,
  product,
  onAction,
}: {
  line: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
  onAction: (action: TransactionAction) => void
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onAction({ type: 'quote', budgetLine: line, product })}
      >
        <ScrollText aria-hidden="true" />
        Devis
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onAction({ type: 'diy_estimate', budgetLine: line, product })
        }
      >
        <Hammer aria-hidden="true" />
        DIY
      </Button>
      <Button
        size="sm"
        variant="gold"
        onClick={() => onAction({ type: 'invoice', budgetLine: line, product })}
      >
        <ReceiptText aria-hidden="true" />
        Facture
      </Button>
    </div>
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
      <TableCell colSpan={8} className="px-4 py-2">
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
  onAction,
}: {
  product: ProductSummaryViewModel
  isOpen: boolean
  onToggle: () => void
  onAction: (action: TransactionAction) => void
}) {
  const wholeProductLine = getWholeProductBudgetLine(product)

  return (
    <TableRow className="bg-card hover:bg-muted/40">
      <TableCell className="min-w-72 pl-6">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <ToggleIcon isOpen={isOpen} />
          <span>
            <span className="block font-medium text-foreground">
              {product.product_name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Produit
            </span>
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
      <TableCell>
        {wholeProductLine ? (
          <TransactionActionButtons
            line={wholeProductLine}
            product={product}
            onAction={onAction}
          />
        ) : (
          <span className="block text-right text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function BudgetLineRow({
  line,
  product,
  isOpen,
  onToggle,
  onAction,
}: {
  line: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
  isOpen: boolean
  onToggle: () => void
  onAction: (action: TransactionAction) => void
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
      <TableCell>
        <TransactionActionButtons
          line={line}
          product={product}
          onAction={onAction}
        />
      </TableCell>
    </TableRow>
  )
}

function TransactionsRows({
  transactions,
}: {
  transactions: TransactionViewModel[]
}) {
  return (
    <TableRow className="border-t-0 bg-background hover:bg-background">
      <TableCell colSpan={8} className="p-0">
        <div className="bg-background px-8 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Montant TTC</TableHead>
                <TableHead>Statut devis</TableHead>
                <TableHead>Statut facture</TableHead>
                <TableHead>Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{formatDate(transaction.issued_date)}</TableCell>
                  <TableCell>
                    <StatusBadge status={transaction.transaction_type} />
                  </TableCell>
                  <TableCell>
                    {transaction.supplier_name ?? 'Autoconstruction'}
                  </TableCell>
                  <TableCell className="min-w-96">
                    {transaction.description}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(transaction.amount_ttc)}
                  </TableCell>
                  <TableCell>
                    {transaction.quote_status ? (
                      <StatusBadge status={transaction.quote_status} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {transaction.invoice_status ? (
                      <StatusBadge status={transaction.invoice_status} />
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={transaction.document_state} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
  const [activeAction, setActiveAction] = useState<TransactionAction | null>(
    null,
  )

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
                      <TableHead className="text-right">Actions</TableHead>
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
                                      onAction={setActiveAction}
                                    />
                                    {isProductOpen ? (
                                      wholeProductLine ? (
                                        <TransactionsRows
                                          transactions={
                                            wholeProductLine.transactions
                                          }
                                        />
                                      ) : (
                                        product.budget_lines.map((line) => {
                                          const isLineOpen =
                                            openBudgetLines.has(
                                              line.budget_line_id,
                                            )

                                          return (
                                            <Fragment key={line.budget_line_id}>
                                              <BudgetLineRow
                                                line={line}
                                                product={product}
                                                isOpen={isLineOpen}
                                                onToggle={() =>
                                                  toggleSet(
                                                    setOpenBudgetLines,
                                                    line.budget_line_id,
                                                  )
                                                }
                                                onAction={setActiveAction}
                                              />
                                              {isLineOpen ? (
                                                <TransactionsRows
                                                  transactions={
                                                    line.transactions
                                                  }
                                                />
                                              ) : null}
                                            </Fragment>
                                          )
                                        })
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
              <div>
                <p className="font-heading text-xl font-semibold">
                  {transactionActionLabels[activeAction.type]}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Action de démonstration depuis la ligne «{' '}
                  {activeAction.budgetLine.name} » du produit «{' '}
                  {activeAction.product.product_name} ». Le formulaire
                  compatible backend arrive au Chunk 7.
                </p>
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
