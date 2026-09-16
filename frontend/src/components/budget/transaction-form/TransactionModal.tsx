import { type SyntheticEvent, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2 } from 'lucide-react'

import {
  invalidateBudgetWorkspaceQueries,
  invalidateDocumentQueries,
} from '@/api/budget-workspace-cache'
import { getApiErrorMessage } from '@/api/client'
import { useUploadTransactionDocumentMutation } from '@/api/documents'
import {
  useCreateBudgetLineTransactionMutation,
  useCreateProductTransactionMutation,
} from '@/api/transactions'
import type { TransactionRead } from '@/api/types'
import {
  ModalCloseButton,
  ModalSaveButton,
  ModalShell,
} from '@/components/shared/ModalShell'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { notifyError, notifySuccess } from '@/lib/toasts'
import { cn } from '@/lib/utils'
import type {
  BudgetLine,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  Product,
  Project,
  QuoteStatus,
  Supplier,
  TransactionType,
} from '@/types'

import { SupplierSelectField } from './SupplierSelectField'
import {
  Field,
  NewTransactionDocumentField,
  TransactionContextSummary,
} from './TransactionFormFields'
import {
  type BudgetConcern,
  type ProductStructureChoice,
  buildProductTransactionCreate,
  buildTransactionCreate,
  canSelectCreatedTransactionAsBudget,
  createInitialFormState,
  invoiceStatusLabels,
  invoiceTypeLabels,
  issuedDateLabels,
  normalizeForType,
  paymentMethodLabels,
  quoteStatusLabels,
  requiredId,
  transactionTypeLabels,
} from './transactionForm'
import { useTransactionAmountForm } from './useTransactionAmountForm'

type CreatedTransactionForDocument = {
  transactionId: number
  budgetLineId: number
}

type TransactionModalProps = {
  project: Project
  product: Product
  budgetLine?: BudgetLine
  initialStructure?: ProductStructureChoice
  suppliers: Supplier[]
  onClose: () => void
}

export function TransactionModal({
  project,
  product,
  budgetLine,
  initialStructure,
  suppliers,
  onClose,
}: TransactionModalProps) {
  const queryClient = useQueryClient()
  const createBudgetLineTransactionMutation =
    useCreateBudgetLineTransactionMutation()
  const createProductTransactionMutation = useCreateProductTransactionMutation()
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [createdTransactionForDocument, setCreatedTransactionForDocument] =
    useState<CreatedTransactionForDocument | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const { form, setForm, updateField } = useTransactionAmountForm(
    () => createInitialFormState(initialStructure),
    { onChange: () => setMutationError(null) },
  )
  const uploadDocumentMutation = useUploadTransactionDocumentMutation()
  const isProductScoped = !budgetLine
  const canTargetBudgetLine = form.transaction_type !== 'invoice'
  const canSelectAsBudget = canSelectCreatedTransactionAsBudget(form)
  const isSubmitting =
    createBudgetLineTransactionMutation.isPending ||
    createProductTransactionMutation.isPending ||
    uploadDocumentMutation.isPending

  function updateQuoteStatus(quoteStatus: QuoteStatus) {
    setForm((current) => ({
      ...current,
      quote_status: quoteStatus,
      select_as_budget:
        quoteStatus === 'rejected' ? false : current.select_as_budget,
    }))
    setMutationError(null)
  }

  function getSelectAsBudgetHint() {
    if (form.transaction_type === 'quote' && form.quote_status === 'rejected') {
      return 'Un devis rejeté ne peut pas être sélectionné comme budget.'
    }
    return 'Le montant contribuera au budget sélectionné de ce poste.'
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault()
    setMutationError(null)
    let isUploadingDocument = false

    try {
      const projectId = requiredId(project.id, 'Projet')
      let createdTransaction: TransactionRead
      let targetBudgetLineId: number

      if (createdTransactionForDocument) {
        createdTransaction = {
          id: createdTransactionForDocument.transactionId,
          budget_line_id: createdTransactionForDocument.budgetLineId,
        } as TransactionRead
        targetBudgetLineId = createdTransactionForDocument.budgetLineId
      } else if (budgetLine) {
        const budgetLineId = requiredId(
          budgetLine.budget_line_id,
          'Ligne de budget',
        )
        createdTransaction =
          await createBudgetLineTransactionMutation.mutateAsync({
            projectId,
            budgetLineId,
            transaction: buildTransactionCreate({ form }),
          })
        targetBudgetLineId = budgetLineId
        invalidateBudgetWorkspaceQueries(queryClient, projectId, budgetLineId)
      } else {
        const productId = requiredId(product.product_id, 'Produit')
        createdTransaction = await createProductTransactionMutation.mutateAsync(
          {
            projectId,
            productId,
            transaction: buildProductTransactionCreate(form),
          },
        )
        targetBudgetLineId = createdTransaction.budget_line_id
        invalidateBudgetWorkspaceQueries(
          queryClient,
          projectId,
          createdTransaction.budget_line_id,
        )
      }

      if (documentFile) {
        isUploadingDocument = true
        setCreatedTransactionForDocument({
          transactionId: createdTransaction.id,
          budgetLineId: targetBudgetLineId,
        })
        await uploadDocumentMutation.mutateAsync({
          transactionId: createdTransaction.id,
          file: documentFile,
        })
        invalidateDocumentQueries(queryClient, createdTransaction.id)
        invalidateBudgetWorkspaceQueries(
          queryClient,
          projectId,
          targetBudgetLineId,
        )
      }

      notifySuccess(
        documentFile
          ? 'Transaction ajoutée avec son document.'
          : 'Transaction ajoutée.',
      )
      onClose()
    } catch (error) {
      const message = getApiErrorMessage(error)
      setMutationError(message)
      notifyError(
        isUploadingDocument
          ? `Impossible d’ajouter le document. ${message}`
          : `Impossible d’ajouter la transaction. ${message}`,
      )
    }
  }

  return (
    <ModalShell
      title="Ajouter une transaction"
      icon={<FilePlus2 className="h-5 w-5" aria-hidden="true" />}
      onClose={onClose}
      footer={
        <>
          <ModalCloseButton onClick={onClose} disabled={isSubmitting} />
          <ModalSaveButton
            form="transaction-create-form"
            disabled={isSubmitting}
            isSaving={isSubmitting}
            savingLabel="Création..."
          >
            Créer
          </ModalSaveButton>
        </>
      }
    >
      <form
        id="transaction-create-form"
        className="space-y-4"
        onSubmit={handleSubmit}
      >
        <TransactionContextSummary
          project={project}
          product={product}
          budgetLine={budgetLine}
        />

        <div className="space-y-3 rounded-md border border-border p-4">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Transaction
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Type" htmlFor="transaction-type">
              <Select
                id="transaction-type"
                value={form.transaction_type}
                onChange={(event) =>
                  setForm((current) =>
                    normalizeForType(
                      current,
                      event.target.value as TransactionType,
                    ),
                  )
                }
              >
                {Object.entries(transactionTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fournisseur" htmlFor="transaction-supplier">
              <SupplierSelectField
                id="transaction-supplier"
                value={form.supplier_id}
                suppliers={suppliers}
                onChange={(supplierId) =>
                  updateField('supplier_id', supplierId)
                }
              />
            </Field>
            <Field label="Montant HT" htmlFor="transaction-amount-ht">
              <Input
                id="transaction-amount-ht"
                type="number"
                min="0"
                step="0.01"
                value={form.amount_ht}
                onChange={(event) =>
                  updateField('amount_ht', event.target.value)
                }
                required
              />
            </Field>
            <Field label="TVA (%)" htmlFor="transaction-vat-rate">
              <Input
                id="transaction-vat-rate"
                type="number"
                min="0"
                step="0.01"
                value={form.vat_rate}
                onChange={(event) =>
                  updateField('vat_rate', event.target.value)
                }
              />
            </Field>
            <Field label="Montant TVA" htmlFor="transaction-amount-vat">
              <Input
                id="transaction-amount-vat"
                type="number"
                min="0"
                step="0.01"
                value={form.amount_vat}
                disabled
                readOnly
              />
            </Field>
            <Field label="Montant TTC" htmlFor="transaction-amount-ttc">
              <Input
                id="transaction-amount-ttc"
                type="number"
                min="0"
                step="0.01"
                value={form.amount_ttc}
                onChange={(event) =>
                  updateField('amount_ttc', event.target.value)
                }
                required
              />
            </Field>
            <Field
              label={issuedDateLabels[form.transaction_type]}
              htmlFor="transaction-issued-date"
            >
              <Input
                id="transaction-issued-date"
                type="date"
                value={form.issued_date}
                onChange={(event) =>
                  updateField('issued_date', event.target.value)
                }
                required
              />
            </Field>

            {form.transaction_type === 'quote' ? (
              <>
                <Field label="Statut devis" htmlFor="transaction-quote-status">
                  <Select
                    id="transaction-quote-status"
                    value={form.quote_status}
                    onChange={(event) =>
                      updateQuoteStatus(event.target.value as QuoteStatus)
                    }
                  >
                    {Object.entries(quoteStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date d'échéance" htmlFor="transaction-due-date">
                  <Input
                    id="transaction-due-date"
                    type="date"
                    value={form.due_date}
                    onChange={(event) =>
                      updateField('due_date', event.target.value)
                    }
                  />
                </Field>
              </>
            ) : null}

            {form.transaction_type === 'invoice' ? (
              <>
                <Field
                  label="Statut facture"
                  htmlFor="transaction-invoice-status"
                >
                  <Select
                    id="transaction-invoice-status"
                    value={form.invoice_status}
                    onChange={(event) =>
                      updateField(
                        'invoice_status',
                        event.target.value as InvoiceStatus,
                      )
                    }
                  >
                    {Object.entries(invoiceStatusLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field label="Type facture" htmlFor="transaction-invoice-type">
                  <Select
                    id="transaction-invoice-type"
                    value={form.invoice_type}
                    onChange={(event) =>
                      updateField(
                        'invoice_type',
                        event.target.value as InvoiceType,
                      )
                    }
                  >
                    {Object.entries(invoiceTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Moyen de paiement"
                  htmlFor="transaction-payment-method"
                >
                  <Select
                    id="transaction-payment-method"
                    value={form.payment_method}
                    onChange={(event) =>
                      updateField(
                        'payment_method',
                        event.target.value as PaymentMethod,
                      )
                    }
                  >
                    {Object.entries(paymentMethodLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>
                <Field label="Date d'échéance" htmlFor="transaction-due-date">
                  <Input
                    id="transaction-due-date"
                    type="date"
                    value={form.due_date}
                    onChange={(event) =>
                      updateField('due_date', event.target.value)
                    }
                  />
                </Field>
                <Field
                  label="Date de paiement"
                  htmlFor="transaction-payment-date"
                >
                  <Input
                    id="transaction-payment-date"
                    type="date"
                    value={form.payment_date}
                    onChange={(event) =>
                      updateField('payment_date', event.target.value)
                    }
                  />
                </Field>
              </>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            {isProductScoped && canTargetBudgetLine ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Portée budget"
                  htmlFor="transaction-budget-concern"
                >
                  <Select
                    id="transaction-budget-concern"
                    value={form.budget_concern}
                    onChange={(event) =>
                      updateField(
                        'budget_concern',
                        event.target.value as BudgetConcern,
                      )
                    }
                  >
                    <option value="entire_product">Produit entier</option>
                    <option value="specific_element">Sous-produit</option>
                  </Select>
                </Field>
                {form.budget_concern === 'specific_element' ? (
                  <Field
                    label="Nom du sous-produit"
                    htmlFor="transaction-budget-line-name"
                  >
                    <Input
                      id="transaction-budget-line-name"
                      value={form.budget_line_name}
                      onChange={(event) =>
                        updateField('budget_line_name', event.target.value)
                      }
                      required
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}

            {form.transaction_type === 'invoice' ? null : (
              <div
                className={cn(
                  'rounded-md border p-3',
                  canSelectAsBudget
                    ? 'border-border bg-background'
                    : 'border-border bg-muted/40',
                )}
              >
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={canSelectAsBudget && form.select_as_budget}
                    disabled={!canSelectAsBudget}
                    onChange={(event) =>
                      updateField('select_as_budget', event.target.checked)
                    }
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Sélectionner comme budget
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {getSelectAsBudgetHint()}
                    </span>
                  </span>
                </label>
              </div>
            )}

            <Field label="Description" htmlFor="transaction-description">
              <Input
                id="transaction-description"
                value={form.description}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
              />
            </Field>

            <NewTransactionDocumentField
              file={documentFile}
              disabled={isSubmitting}
              onFileChange={(file) => {
                setDocumentFile(file)
                setMutationError(null)
              }}
              onClear={() => setDocumentFile(null)}
            />
          </div>
        </div>

        {mutationError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {mutationError}
          </div>
        ) : null}
      </form>
    </ModalShell>
  )
}
