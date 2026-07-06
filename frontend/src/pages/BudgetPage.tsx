import { Fragment, useMemo, useState } from 'react'
import {
  ChevronDown,
  DoorOpen,
  Droplets,
  Edit3,
  Eye,
  FilePlus2,
  Hammer,
  HardHat,
  Layers3,
  Paintbrush,
  PaintRoller,
  Paperclip,
  Plus,
  Shovel,
  Trees,
  type LucideIcon,
} from 'lucide-react'

import {
  TransactionModal,
  TransactionReviewModal,
  type ViewedTransactionContext,
} from '@/components/budget/TransactionModal'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import {
  budgetWorkspaceViewModel,
  supplierTableViewModel,
} from '@/demo/demo-data'
import type {
  BudgetCategoryViewModel,
  BudgetLineSummaryViewModel,
  ProductSummaryViewModel,
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

type TransactionReviewState = {
  context: ViewedTransactionContext
  initialMode: 'view' | 'edit'
}

const categoryIcons: Record<string, LucideIcon> = {
  'Terrain & Préparation': Shovel,
  Viabilisation: Droplets,
  'Gros œuvre': HardHat,
  Menuiseries: DoorOpen,
  'Second œuvre': PaintRoller,
  Finitions: Paintbrush,
  Extérieurs: Trees,
}

function varianceClass(value: number) {
  if (value < 0) return 'text-destructive'
  if (value > 0) return 'text-success'
  return 'text-muted-foreground'
}

function getSelectedBudgetParts(line: BudgetLineSummaryViewModel) {
  const selectedQuote = line.transactions.find(
    (transaction) => transaction.id === line.selected_quote_transaction_id,
  )
  const selectedDiyEstimate = line.transactions.find(
    (transaction) =>
      transaction.id === line.selected_diy_estimate_transaction_id,
  )

  return {
    selectedQuote,
    selectedDiyEstimate,
  }
}

function formatSelectedBudgetSource(line: BudgetLineSummaryViewModel) {
  const { selectedQuote, selectedDiyEstimate } = getSelectedBudgetParts(line)
  const parts = [
    selectedQuote ? '1 devis' : null,
    selectedDiyEstimate ? '1 estimation DIY' : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' + ') : 'Aucun budget sélectionné'
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
      <TableCell colSpan={7} className="px-6! pt-0! pb-0!">
        <div className="flex items-center justify-between pt-1 pb-3">
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
      <TableCell colSpan={7} className="px-6! pt-1! pb-0!">
        <div className="flex items-center justify-between pt-1 pb-3">
          <span className="text-xs text-muted-foreground">
            Transactions pour ce sous-produit
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
              {product.product_name}
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
      <TableCell colSpan={7} className="px-4 py-2 pl-12">
        <button
          type="button"
          className="grid w-full grid-cols-1 gap-y-3 text-left sm:grid-cols-[minmax(18rem,1fr)_7.25rem_7.25rem_7.25rem] sm:items-center sm:gap-x-1"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span
              className="h-7 w-1.5 rounded-full bg-gold/75"
              aria-hidden="true"
            />
            <span>
              <span className="block font-medium text-foreground">
                {line.name}
              </span>
              <span className="hidden mt-1 text-xs text-muted-foreground">
                Budget sélectionné: {formatCurrency(line.selected_budget_amount_ttc)}
                {' '}
                ({formatSelectedBudgetSource(line)})
              </span>
            </span>
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
        </button>
      </TableCell>
    </TableRow>
  )
}

function TransactionsRows({
  transactions,
  budgetLine,
  product,
  onEditTransaction,
  onViewTransaction,
}: {
  transactions: TransactionViewModel[]
  budgetLine: BudgetLineSummaryViewModel
  product: ProductSummaryViewModel
  onEditTransaction: (context: ViewedTransactionContext) => void
  onViewTransaction: (context: ViewedTransactionContext) => void
}) {
  const transactionGridClass =
    'grid min-w-[54rem] grid-cols-[5rem_8rem_minmax(10rem,1fr)_7rem_6.25rem_7rem_5rem_4rem] items-center'
  const budgetCandidates = transactions.filter((transaction) =>
    ['quote', 'diy_estimate'].includes(transaction.transaction_type),
  )
  const invoices = transactions.filter(
    (transaction) => transaction.transaction_type === 'invoice',
  )

  function renderSectionDivider(label: string) {
    return (
      <div
        className={cn(
          transactionGridClass,
          'border-y border-border bg-muted/55',
        )}
      >
        <div className="col-span-8 px-2.5 py-2 text-[11px] font-bold tracking-normal text-foreground uppercase">
          {label}
        </div>
      </div>
    )
  }

  function isSelectedBudgetTransaction(transaction: TransactionViewModel) {
    return (
      transaction.id === budgetLine.selected_quote_transaction_id ||
      transaction.id === budgetLine.selected_diy_estimate_transaction_id
    )
  }

  function renderTransactionRows(sectionTransactions: TransactionViewModel[]) {
    if (sectionTransactions.length === 0) {
      return (
        <div className={cn(transactionGridClass, 'border-t border-border/40')}>
          <div className="col-span-8 px-2 py-2 text-muted-foreground">
            Aucune transaction
          </div>
        </div>
      )
    }

    return sectionTransactions.map((transaction) => {
      const financialStatus =
        transaction.quote_status ?? transaction.invoice_status
      const isSelectedBudget = isSelectedBudgetTransaction(transaction)

      return (
        <div
          key={transaction.id}
          className={cn(
            transactionGridClass,
            'border-t border-border/40',
            isSelectedBudget && 'bg-gold/10',
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
          <div className="px-3 py-2 whitespace-nowrap">
            {transaction.transaction_type === 'invoice' ? (
              <span className="text-muted-foreground">-</span>
            ) : isSelectedBudget ? (
              <Badge variant="gold">Sélectionné</Badge>
            ) : (
              <Badge variant="muted" className="opacity-75">
                Non retenu
              </Badge>
            )}
          </div>
          <div className="px-1 py-2 text-center whitespace-nowrap">
            <div className="inline-flex justify-center gap-1">
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
                onClick={() =>
                  onViewTransaction({
                    budgetLine,
                    product,
                    transaction,
                  })
                }
                aria-label="Voir la transaction"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-gold/15 hover:text-gold"
                onClick={() =>
                  onEditTransaction({
                    budgetLine,
                    product,
                    transaction,
                  })
                }
                aria-label="Modifier la transaction"
              >
                <Edit3 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
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
    })
  }

  return (
    <TableRow className="border-t-0 bg-muted/10 hover:bg-muted/10!">
      <TableCell colSpan={7} className="max-w-0 p-0!">
        <div className="min-w-0 px-6 pb-5">
          <div className="w-full min-w-0 overflow-x-auto border border-border bg-background/70 text-xs">
            <div className="hidden border-t border-border/50 px-2 py-2">
              <p className="whitespace-nowrap font-medium text-foreground">
                Budget sélectionné {formatCurrency(budgetLine.selected_budget_amount_ttc)}
                <span className="ml-1 text-muted-foreground">
                  ({formatSelectedBudgetSource(budgetLine)})
                </span>
              </p>
            </div>
            <div
              className={transactionGridClass}
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
              <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
                Budget
              </div>
              <div className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
                Actions
              </div>
              <div className="px-1 py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
                Doc
              </div>
            </div>

            {renderSectionDivider('Candidats budget')}
            {renderTransactionRows(budgetCandidates)}

            {renderSectionDivider('Dépenses réelles')}
            {renderTransactionRows(invoices)}
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
  const [transactionReview, setTransactionReview] =
    useState<TransactionReviewState | null>(null)
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
                                              budgetLine={wholeProductLine}
                                              product={product}
                                              onEditTransaction={(context) =>
                                                setTransactionReview({
                                                  context,
                                                  initialMode: 'edit',
                                                })
                                              }
                                              onViewTransaction={(context) =>
                                                setTransactionReview({
                                                  context,
                                                  initialMode: 'view',
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
                                                        budgetLine={line}
                                                        product={product}
                                                        onEditTransaction={(
                                                          context,
                                                        ) =>
                                                          setTransactionReview({
                                                            context,
                                                            initialMode: 'edit',
                                                          })
                                                        }
                                                        onViewTransaction={(
                                                          context,
                                                        ) =>
                                                          setTransactionReview({
                                                            context,
                                                            initialMode: 'view',
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

      {activeAction?.kind === 'transaction' ? (
        <TransactionModal
          project={project}
          product={activeAction.product}
          budgetLine={activeAction.budgetLine}
          initialStructure={activeAction.initialStructure}
          suppliers={supplierTableViewModel.suppliers}
          onClose={() => setActiveAction(null)}
        />
      ) : null}

      {activeAction && activeAction.kind !== 'transaction' ? (
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

      {transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview.context}
          initialMode={transactionReview.initialMode}
          suppliers={supplierTableViewModel.suppliers}
          onClose={() => setTransactionReview(null)}
        />
      ) : null}
    </section>
  )
}
