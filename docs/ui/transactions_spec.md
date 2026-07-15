# Transactions Workspace Strategy

## Objective

Define the long-term UX strategy for transaction management.

This document is the functional specification for the Transactions page and
the wider Dashboard/Budget/Transactions navigation model. The implementation
roadmap below (Chunks 1-2) is complete; the document is retained as the
living UX spec for this area.

Unlike the Budget Workspace, this document focuses on **user workflows** rather than backend integration.

---

# Philosophy

The application exposes the same project data through different perspectives.

Each page answers a different question.

## Dashboard

The detailed Dashboard strategy now lives in docs/ui/dashboard_spec.md. This document focuses exclusively on the Transactions workspace.

## Budget

Question:

> How is my construction budget structured?

Purpose:

- Build and maintain the budget hierarchy
- Add transactions
- Compare quotes
- Manage breakdowns
- Follow financial progress by product

The Budget page is **hierarchical**.

Users think in:

Category

↓

Subcategory

↓

Product

↓

Budget Line

↓

Transactions

---

## Transactions

Question:

> Which transaction do I need to review or update?

Purpose:

- Quickly find any transaction
- Search
- Filter
- Review
- Edit
- Upload documents
- Update statuses

The Transactions page is **flat**.

Hierarchy disappears.

Transactions become the primary entity.

---

# User Workflows

## Workflow A — Bâti Budget

User wants to:

- create a budget
- compare supplier quotes
- estimate DIY costs
- decompose products
- select budget candidates

Entry point:

Budget

---

## Workflow B — Daily Administration

User wants to:

- pay invoices
- validate quotes
- attach documents
- modify transaction amounts
- check recent activity

Entry point:

Transactions

---

## Workflow C — Project Monitoring

User wants to:

- know whether the project is healthy
- monitor overspending
- review KPIs
- identify pending actions

Entry point:

Dashboard

---

# Transactions Page

## Objective

Provide a fast operational workspace.

Think of this page as an "Inbox" for project transactions.

One row = one transaction.

No hierarchy.

---

## Default Sort

Newest first.

Users can also sort by clicking the table headers for:

- Date
- Montant TTC

---

## Suggested Columns

- Date
- Type
- Supplier
- Product
- Budget Line
- Amount TTC
- Status
- Documents
- Actions

---

## Search

Global search should match:

- supplier
- product
- budget line
- original document filename
- transaction amount
- transaction type

---

## Quick Views

Quick Views are predefined operational views rather than generic filters.

They appear as pills directly below the page title.

Suggested views include:

- Toutes
- Factures impayées
- Devis à confirmer
- Devis à négocier
- Documents manquants
- Transactions récentes
- Budget sélectionné
- Budget non sélectionné
- Budget à valider

Each Quick View displays the number of matching transactions.

Dashboard widgets should deep-link directly to these Quick Views.

---

## Filters

These are secondary filters that refine the currently selected Quick View.

Filters include:

- Type
- Catégorie
- Fournisseur
- Date

---

## Row Actions

Every transaction should support:

- View
- Edit
- Upload document
- Download document
- Delete

Reuse the existing transaction modal.

Do not introduce another editing workflow.

---

# UX Principles

Always:

- Keep editing centralized.
- Reuse the existing transaction modal.
- Reuse React Query.
- Reuse existing backend APIs.
- Deep-link Dashboard widgets to filtered Transactions.
- Keep Budget hierarchy untouched.

Never:

- Duplicate editing workflows.
- Turn the Dashboard into another Transactions page.
- Mix hierarchy with chronological navigation.
- Duplicate backend business logic.

---

# Suggested Implementation Chunks

## Chunk 1 — Transactions Page

Goal

Create the new Transactions page.

Tasks

- Build flat transaction table
- Add search
- Add sorting
- Add pagination
- Reuse existing transaction modal

Deliverable

Operational transaction workspace.

Status: Completed.

---

## Chunk 2 — Quick Views & Filters

Goal

Implement both Quick Views and secondary filters.

Tasks

- Implement Quick Views
- Display counters on Quick Views
- Secondary filters (Type, Catégorie, Fournisseur, Date)
- Column sorting (Date, Montant TTC)
- Backend query optimization for project-level transaction retrieval

Deliverable

Transactions page becomes a fast operational workspace with predefined views, secondary filters and efficient backend querying.

Status: Completed.

---

# Final Vision

The application offers a comprehensive operational workspace for reviewing, searching, updating, and completing every project transaction through the **Transactions** page.

Dashboard and Budget have their own dedicated strategy documents to cover executive monitoring and hierarchical budget management respectively.
