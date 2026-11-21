import { useState, type ReactNode } from 'react'
import { ArrowRight, Check, Minus } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { SupplierDocumentRead } from '@/api/types'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/format'
import { formatPhoneNumber } from '@/lib/phone'
import {
  SUPPLIER_DOCUMENT_TYPES,
  expirySignal,
  nextExpiringDocument,
  supplierDocumentTypeLabels,
} from '@/lib/supplierDocuments'
import {
  phoneHref,
  primaryContact,
  supplierAddressLines,
} from '@/lib/supplierContact'
import type { MoneyFigures } from '@/lib/supplierStats'
import { cn } from '@/lib/utils'
import type { Supplier, SupplierContact } from '@/types'

import { ExpirySignalBadge } from './SupplierDocumentBadges'

function SummaryCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card className="flex min-w-0 flex-col px-4 py-3">
      <h2 className="font-[family-name:var(--font-body)] text-sm font-semibold text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-2 flex flex-1 flex-col text-sm">{children}</div>
    </Card>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] leading-4 text-muted-foreground">{label}</dt>
      <dd className="wrap-break-word">{children}</dd>
    </div>
  )
}

function NotProvided({ children = 'Non renseigné' }: { children?: string }) {
  return <span className="text-xs text-muted-foreground">{children}</span>
}

function CoordinatesCard({ supplier }: { supplier: Supplier }) {
  const addressLines = supplierAddressLines(supplier)

  return (
    <SummaryCard title="Coordonnées">
      <dl className="space-y-2">
        <Line label="SIRET / SIREN">{supplier.siret ?? <NotProvided />}</Line>
        <Line label="N° RNE">{supplier.rne_number ?? <NotProvided />}</Line>
        <Line label="Adresse">
          {addressLines.length > 0 ? (
            addressLines.map((line) => <div key={line}>{line}</div>)
          ) : (
            <NotProvided>Aucune adresse enregistrée.</NotProvided>
          )}
        </Line>
      </dl>
    </SummaryCard>
  )
}

function ContactLines({ contact }: { contact: SupplierContact }) {
  return (
    <div className="min-w-0 space-y-0.5">
      {contact.name ? (
        <div className="truncate font-medium">{contact.name}</div>
      ) : null}
      {contact.phone_number ? (
        <a
          className="block truncate text-gold underline underline-offset-4"
          href={phoneHref(contact.phone_number)}
        >
          {formatPhoneNumber(contact.phone_number)}
        </a>
      ) : null}
      {contact.email ? (
        <a
          className="block truncate text-gold underline underline-offset-4"
          href={`mailto:${encodeURIComponent(contact.email)}`}
        >
          {contact.email}
        </a>
      ) : null}
    </div>
  )
}

function ContactsCard({ supplier }: { supplier: Supplier }) {
  const [showOthers, setShowOthers] = useState(false)
  const contact = primaryContact(supplier)
  const others = supplier.contacts.filter(
    (candidate) => candidate.id !== contact?.id,
  )

  return (
    <SummaryCard title="Contacts">
      {contact ? (
        <div className="space-y-2">
          <ContactLines contact={contact} />
          {others.length > 0 ? (
            <>
              <button
                type="button"
                className="rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-expanded={showOthers}
                onClick={() => setShowOthers((current) => !current)}
              >
                {showOthers
                  ? 'Masquer les autres'
                  : `+${others.length} autre${others.length > 1 ? 's' : ''}`}
              </button>
              {showOthers ? (
                <div className="space-y-2 border-t border-border/60 pt-2">
                  {others.map((other) => (
                    <ContactLines key={other.id} contact={other} />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <NotProvided>Aucun contact enregistré.</NotProvided>
      )}
    </SummaryCard>
  )
}

function Figure({
  label,
  amount,
  className,
}: {
  label: string
  amount: number
  className?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'truncate text-sm font-semibold text-foreground tabular-nums',
          className,
        )}
      >
        {formatCurrency(amount)}
      </dd>
    </div>
  )
}

// The supplier's figures in the project: Coût prévu first and larger, then
// Facturé, Payé and À payer (stressed while something is left to pay), and
// the validated quotes as a reference line.
function BalanceCard({ figures }: { figures: MoneyFigures }) {
  const counts = [
    `${figures.quoteCount} devis`,
    `${figures.invoiceCount} facture${figures.invoiceCount > 1 ? 's' : ''}`,
  ].join(' · ')

  return (
    <SummaryCard title="Bilan" description={`${counts} sur ce projet`}>
      <dl className="space-y-3">
        <div>
          <dt className="text-xs text-muted-foreground">Coût prévu</dt>
          <dd className="text-xl font-semibold text-foreground tabular-nums">
            {formatCurrency(figures.plannedTtc)}
          </dd>
        </div>
        <div className="grid grid-cols-3 gap-x-3">
          <Figure label="Facturé" amount={figures.invoicedTtc} />
          <Figure label="Payé" amount={figures.paidTtc} />
          <Figure
            label="À payer"
            amount={figures.toPayTtc}
            className={figures.toPayTtc !== 0 ? 'text-gold' : undefined}
          />
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-border/60 pt-2 text-xs">
          <dt className="text-muted-foreground">Devis validés</dt>
          <dd className="font-medium text-muted-foreground tabular-nums">
            {formatCurrency(figures.validatedQuotesTtc)}
          </dd>
        </div>
      </dl>
    </SummaryCard>
  )
}

function DocumentsCard({
  documents,
  documentsHref,
}: {
  documents: SupplierDocumentRead[]
  documentsHref: string
}) {
  const presentTypes = new Set(documents.map((document) => document.type))
  const next = nextExpiringDocument(documents)
  const signal = next ? expirySignal(next.expiry_date) : null

  return (
    <SummaryCard title="Documents">
      <ul className="space-y-0.5 text-[0.7rem] leading-4">
        {SUPPLIER_DOCUMENT_TYPES.map((type) => {
          const isPresent = presentTypes.has(type)
          return (
            <li
              key={type}
              className={cn(
                'flex items-center gap-1.5',
                isPresent ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {isPresent ? (
                <Check className="h-3.5 w-3.5 text-success" aria-hidden />
              ) : (
                <Minus className="h-3.5 w-3.5" aria-hidden />
              )}
              {supplierDocumentTypeLabels[type]}
              <span className="sr-only">
                {isPresent ? ' : présent' : ' : absent'}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 border-t border-border/60 pt-2 text-[0.7rem] leading-4">
        <span className="block text-muted-foreground">Prochaine échéance</span>
        {next?.expiry_date ? (
          <span className="flex flex-wrap items-center gap-1.5 font-semibold">
            {supplierDocumentTypeLabels[next.type]} ·{' '}
            {formatDate(next.expiry_date)}
            {signal ? <ExpirySignalBadge signal={signal} /> : null}
          </span>
        ) : (
          <span className="block text-muted-foreground">Aucune</span>
        )}
      </div>
      <div className="mt-auto pt-3">
        <Link
          to={documentsHref}
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
        >
          <ArrowRight aria-hidden="true" />
          Voir les documents
        </Link>
      </div>
    </SummaryCard>
  )
}

// The Synthèse tab: four compact cards, side by side from lg, stacked below.
export function SupplierSummaryCards({
  supplier,
  figures,
  documents,
  documentsHref,
}: {
  supplier: Supplier
  figures: MoneyFigures
  documents: SupplierDocumentRead[]
  documentsHref: string
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-4">
      <CoordinatesCard supplier={supplier} />
      <ContactsCard supplier={supplier} />
      <BalanceCard figures={figures} />
      <DocumentsCard documents={documents} documentsHref={documentsHref} />
    </div>
  )
}
