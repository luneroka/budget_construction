import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Copy,
  FileText,
  Files,
  Mail,
  MapPin,
  Pencil,
  TrendingUp,
  Zap,
} from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import { useDocumentsQuery } from '@/api/documents'
import { useProjectQuery } from '@/api/projects'
import { useSupplierQuery, useSuppliersQuery } from '@/api/suppliers'
import { useProjectTransactionsQuery } from '@/api/transactions'
import type { SupplierDocumentListRead } from '@/api/types'
import { TransactionReviewModal } from '@/components/budget/transaction-form/TransactionReviewModal'
import type { ViewedTransactionContext } from '@/components/budget/TransactionModal'
import { SupplierModal } from '@/components/suppliers/SupplierModal'
import { DocumentViewerDialog } from '@/components/shared/DocumentViewerDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { ProductCell } from '@/components/shared/ProductCell'
import { ProgressBar } from '@/components/shared/ProgressBar'
import { Select } from '@/components/ui/select'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSupplierActions } from '@/hooks/useSupplierActions'
import { useTransactionDocumentViewer } from '@/hooks/useTransactionDocumentViewer'
import { useSupplierRibViewer } from '@/hooks/useSupplierRibViewer'
import {
  projectToDomain,
  supplierToDomain,
  suppliersToDomain,
} from '@/lib/apiAdapters'
import { canToggleBudgetSelection } from '@/lib/budgetDomain'
import {
  formatDocumentPositionLabel,
  formatOriginalFilename,
} from '@/lib/documents'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { formatPhoneNumber } from '@/lib/phone'
import {
  copyEmailToClipboard,
  phoneHref,
  primaryContact,
  supplierAddressLines,
} from '@/lib/supplierContact'
import { supplierTotals } from '@/lib/supplierStats'
import { notifyError } from '@/lib/toasts'
import {
  buildTransactionRow,
  getTransactionStatus,
} from '@/lib/transactionWorkspace'
import { useSelectedProjectId } from '@/state/appState'
import type { SupplierContact } from '@/types'

function useSupplierIdParam(): number | null {
  const { supplierId } = useParams<{ supplierId: string }>()
  const parsed = Number(supplierId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function DetailLine({
  label,
  action,
  children,
}: {
  label: string
  /** Sits at the end of the label's line, e.g. « Voir plus ». */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        {action}
      </div>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

// Every contact reads the same: the name, then its number to call.
function ContactBlock({ contact }: { contact: SupplierContact }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="truncate">{contact.name}</div>
      {contact.phone_number ? (
        <a
          className="block truncate text-gold underline underline-offset-4"
          href={phoneHref(contact.phone_number)}
        >
          {formatPhoneNumber(contact.phone_number)}
        </a>
      ) : null}
    </div>
  )
}

function Figure({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{formatCurrency(amount)}</p>
    </div>
  )
}

export function SupplierDetailPage() {
  const navigate = useNavigate()
  const supplierId = useSupplierIdParam()
  const projectId = useSelectedProjectId()
  const supplierQuery = useSupplierQuery(supplierId)
  const suppliersQuery = useSuppliersQuery()
  const projectQuery = useProjectQuery(projectId)
  const transactionsQuery = useProjectTransactionsQuery(projectId)
  const documentsQuery = useDocumentsQuery()
  const documentViewer = useTransactionDocumentViewer()
  const { saveSupplier, deleteSupplier } = useSupplierActions(projectId)
  const ribViewer = useSupplierRibViewer()
  const [isEditing, setIsEditing] = useState(false)
  const [transactionReview, setTransactionReview] =
    useState<ViewedTransactionContext | null>(null)
  const [pickedEmail, setPickedEmail] = useState<string | null>(null)
  const [showEveryContact, setShowEveryContact] = useState(false)

  const supplier = supplierQuery.data
    ? supplierToDomain(supplierQuery.data)
    : null
  const project = projectQuery.data ? projectToDomain(projectQuery.data) : null
  const suppliers = useMemo(
    () => suppliersToDomain(suppliersQuery.data),
    [suppliersQuery.data],
  )
  const rows = useMemo(
    () =>
      (transactionsQuery.data ?? [])
        .map(buildTransactionRow)
        .filter((row) => row.transaction.supplier_id === String(supplierId))
        .sort((left, right) =>
          right.transaction.issued_date.localeCompare(
            left.transaction.issued_date,
          ),
        ),
    [supplierId, transactionsQuery.data],
  )
  const totals = useMemo(
    () => supplierTotals(rows.map((row) => row.transaction)),
    [rows],
  )
  const rib = useMemo(
    () =>
      (documentsQuery.data ?? []).find(
        (document): document is SupplierDocumentListRead =>
          document.type === 'supplier_document' &&
          document.supplier_id === supplierId,
      ) ?? null,
    [documentsQuery.data, supplierId],
  )

  if (supplierQuery.isLoading) {
    return (
      <section>
        <PageHeader title="Fournisseur" />
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </section>
    )
  }

  if (supplierId === null || supplierQuery.isError || !supplier) {
    return (
      <section>
        <PageHeader title="Fournisseur introuvable" />
        <p className="text-sm text-muted-foreground">
          {supplierQuery.isError
            ? getApiErrorMessage(supplierQuery.error)
            : 'Ce fournisseur n’existe pas ou a été supprimé.'}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate('/suppliers')}
        >
          <ArrowLeft aria-hidden />
          Retour aux fournisseurs
        </Button>
      </section>
    )
  }

  const contact = primaryContact(supplier)
  const addressLines = supplierAddressLines(supplier)
  const otherContacts = supplier.contacts.filter(
    (supplierContact) => supplierContact.id !== contact?.id,
  )
  // Who can be written to: a supplier often has several contacts, and only
  // some of them have an address.
  const emailContacts = supplier.contacts.filter(
    (supplierContact) => (supplierContact.email ?? '').trim() !== '',
  )
  const email =
    emailContacts
      .find((supplierContact) => supplierContact.email?.trim() === pickedEmail)
      ?.email?.trim() ??
    contact?.email?.trim() ??
    emailContacts[0]?.email?.trim() ??
    ''
  // Facturation against what was committed; without a retained budget, how
  // much of what has been invoiced is paid.
  const progress =
    totals.retainedTtc > 0
      ? {
          value: totals.invoicedTtc,
          max: totals.retainedTtc,
          tone:
            totals.invoicedTtc > totals.retainedTtc
              ? ('warning' as const)
              : ('success' as const),
          label: `${formatCurrency(totals.invoicedTtc)} facturés sur ${formatCurrency(
            totals.retainedTtc,
          )} retenus`,
        }
      : totals.invoicedTtc > 0
        ? {
            value: totals.paidTtc,
            max: totals.invoicedTtc,
            tone: 'success' as const,
            label: `${formatCurrency(totals.paidTtc)} payés sur ${formatCurrency(
              totals.invoicedTtc,
            )} facturés`,
          }
        : null
  const transactionCounts = [
    `${totals.quoteCount} devis`,
    `${totals.invoiceCount} facture${totals.invoiceCount > 1 ? 's' : ''}`,
  ].join(' · ')

  async function openTransactionDocuments(context: ViewedTransactionContext) {
    const transactionId = Number(context.transaction.id)
    if (!Number.isInteger(transactionId)) {
      notifyError('Identifiant de transaction invalide.')
      return
    }

    await documentViewer.open(
      transactionId,
      `${context.product.product_name} • ${formatCurrency(context.transaction.amount_ttc)}`,
    )
  }

  return (
    <section>
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => navigate('/suppliers')}
      >
        <ArrowLeft aria-hidden />
        Retour aux fournisseurs
      </Button>

      <PageHeader
        title={supplier.name}
        description={supplier.comment.trim() || undefined}
        actions={
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil aria-hidden />
            Modifier
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Coordonnées" icon={MapPin}>
          <dl className="space-y-3 text-sm">
            <DetailLine label="Adresse">
              {addressLines.length > 0 ? (
                addressLines.map((line) => <div key={line}>{line}</div>)
              ) : (
                <span className="text-xs text-muted-foreground">
                  Aucune adresse enregistrée.
                </span>
              )}
            </DetailLine>
            {/* Side by side: a second contact is a short line, and the
                card stays as tall as with one. */}
            <div
              className={cn(
                'grid gap-3',
                otherContacts.length > 0 && 'sm:grid-cols-2',
              )}
            >
              <DetailLine label="Contact principal">
                {contact ? (
                  <ContactBlock contact={contact} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Aucun contact enregistré.
                  </span>
                )}
              </DetailLine>
              {otherContacts.length > 0 ? (
                <DetailLine
                  label="Autres contacts"
                  // From a third contact on, only the first shows: the card
                  // keeps its height and the rest are one click away.
                  action={
                    otherContacts.length > 1 ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() =>
                          setShowEveryContact((current) => !current)
                        }
                      >
                        {showEveryContact
                          ? 'Voir moins'
                          : `Voir plus (${otherContacts.length - 1})`}
                      </button>
                    ) : null
                  }
                >
                  <div className="space-y-2">
                    {(showEveryContact
                      ? otherContacts
                      : otherContacts.slice(0, 1)
                    ).map((supplierContact) => (
                      <ContactBlock
                        key={supplierContact.id}
                        contact={supplierContact}
                      />
                    ))}
                  </div>
                </DetailLine>
              ) : null}
            </div>
          </dl>
        </SectionCard>

        <SectionCard
          title="Bilan"
          description={`${transactionCounts} sur ce projet`}
          icon={TrendingUp}
        >
          <div className="flex h-full flex-col">
            <div className="grid gap-2 sm:grid-cols-2">
              <Figure label="Budget retenu" amount={totals.retainedTtc} />
              <Figure label="Reste à payer" amount={totals.toPayTtc} />
            </div>
            <div className="mt-auto pt-4">
              {progress ? (
                <ProgressBar
                  value={progress.value}
                  max={progress.max}
                  tone={progress.tone}
                  label={progress.label}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun montant enregistré pour ce fournisseur.
                </p>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Accès rapides" icon={Zap}>
          <div className="space-y-2">
            {email ? (
              <>
                {emailContacts.length > 1 ? (
                  <Select
                    aria-label="Contact à qui écrire"
                    value={email}
                    onChange={(event) => setPickedEmail(event.target.value)}
                  >
                    {emailContacts.map((supplierContact) => (
                      <option
                        key={supplierContact.id}
                        value={supplierContact.email ?? ''}
                      >
                        {[supplierContact.name, supplierContact.email]
                          .filter(Boolean)
                          .join(' — ')}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="truncate text-sm text-muted-foreground">
                    {email}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.location.href = `mailto:${encodeURIComponent(email)}`
                    }}
                  >
                    <Mail aria-hidden />
                    Écrire
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void copyEmailToClipboard(email)}
                  >
                    <Copy aria-hidden />
                    Copier
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun email enregistré pour ce fournisseur.
              </p>
            )}
            {rib ? (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => void ribViewer.open(rib)}
              >
                <FileText aria-hidden />
                Voir le RIB
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun RIB joint. Ajoutez-le depuis « Modifier ».
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 space-y-3">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Transactions
        </h2>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Produit</TableHead>
                <TableHead className="w-32 text-right">Montant TTC</TableHead>
                <TableHead className="w-28">Statut</TableHead>
                <TableHead className="w-28">Budget</TableHead>
                <TableHead className="w-16 text-right">Documents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactionsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    Chargement des transactions...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    Aucune transaction avec ce fournisseur sur ce projet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ budgetLine, product, transaction }) => {
                  const context = { budgetLine, product, transaction }
                  const status = getTransactionStatus(transaction)

                  return (
                    <TableRow
                      key={transaction.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={(event) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest('button')
                        ) {
                          return
                        }
                        setTransactionReview(context)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        if (event.target !== event.currentTarget) return
                        event.preventDefault()
                        setTransactionReview(context)
                      }}
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatDate(transaction.issued_date)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={transaction.transaction_type} />
                      </TableCell>
                      <TableCell>{product.category_name}</TableCell>
                      <TableCell>
                        <ProductCell
                          product={product}
                          budgetLine={budgetLine}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {formatCurrency(transaction.amount_ttc)}
                      </TableCell>
                      <TableCell>
                        {status ? <StatusBadge status={status} /> : null}
                      </TableCell>
                      <TableCell>
                        {transaction.transaction_type !== 'invoice' &&
                        transaction.select_as_budget ? (
                          <Badge variant="gold">Sélectionné</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {transaction.document_state === 'attached' ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:bg-gold/15 hover:text-gold"
                            aria-label={
                              transaction.document_count > 1
                                ? 'Voir les documents'
                                : 'Voir le document'
                            }
                            onClick={() =>
                              void openTransactionDocuments(context)
                            }
                          >
                            {transaction.document_count > 1 ? (
                              <Files aria-hidden />
                            ) : (
                              <FileText aria-hidden />
                            )}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isEditing ? (
        <SupplierModal
          mode="edit"
          supplier={supplier}
          onClose={() => setIsEditing(false)}
          onSave={(edited) => saveSupplier(edited, supplier.id)}
          onDelete={async (deleted) => {
            await deleteSupplier(deleted)
            navigate('/suppliers')
          }}
        />
      ) : null}

      {project && transactionReview ? (
        <TransactionReviewModal
          project={project}
          context={transactionReview}
          suppliers={suppliers}
          isBudgetSelected={transactionReview.transaction.select_as_budget}
          canToggleBudgetSelection={canToggleBudgetSelection(
            transactionReview.transaction,
          )}
          onToggleBudgetSelection={() => undefined}
          onClose={() => setTransactionReview(null)}
        />
      ) : null}

      {ribViewer.rib ? (
        <DocumentViewerDialog
          title={`RIB • ${ribViewer.rib.document.supplier_name}`}
          url={ribViewer.rib.url}
          isPending={ribViewer.isLoading}
          error={ribViewer.error}
          onClose={ribViewer.close}
          onDownload={() => void ribViewer.download()}
        />
      ) : null}

      {documentViewer.isOpen && documentViewer.document ? (
        <DocumentViewerDialog
          title={documentViewer.contextLabel}
          positionLabel={formatDocumentPositionLabel(
            documentViewer.index + 1,
            documentViewer.count,
          )}
          subtitle={formatOriginalFilename(
            documentViewer.document.original_filename,
          )}
          url={documentViewer.url}
          isPending={documentViewer.isLoading}
          error={documentViewer.error}
          onClose={documentViewer.close}
          onDownload={() => void documentViewer.download()}
          onPrevious={documentViewer.goToPrevious}
          onNext={documentViewer.goToNext}
          hasPrevious={documentViewer.index > 0}
          hasNext={documentViewer.index < documentViewer.count - 1}
        />
      ) : null}
    </section>
  )
}
