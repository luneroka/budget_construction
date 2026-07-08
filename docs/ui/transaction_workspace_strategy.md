# Transactions Workspace & Dashboard Strategy

## Objective

Define the long-term UX strategy for transaction management and dashboard interactions.

This document serves as both:

- the implementation reference for Codex
- the functional specification
- the progress tracker

Unlike the Budget Workspace, this document focuses on **user workflows** rather than backend integration.

---

# Philosophy

The application exposes the same project data through different perspectives.

Each page answers a different question.

## Dashboard

Question:

> What requires my attention today?

Purpose:

- Monitor project health
- Surface actionable items
- Display KPIs and analytics
- Quickly navigate to operational tasks

The Dashboard is **not** a transaction management page.

---

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

## Workflow A — Budget Construction

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

## Filters

Transaction Type

- Quotes
- DIY Estimates
- Invoices

Status

Quotes

- Draft
- Pending
- Validated
- Rejected

Invoices

- Pending
- Paid

Budget

- Selected budget candidate
- Not selected

Documents

- Has document
- Missing document

Supplier

Date

Project

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

# Dashboard

## Philosophy

The Dashboard is not another transaction page.

It surfaces:

- KPIs
- Charts
- Actionable summaries

Large editable tables belong in the Transactions page.

---

## Layout

### Section 1

Project KPIs

Examples:

- Selected Budget
- Actual Cost
- Remaining Budget
- Variance
- DIY share

---

### Section 2

Charts

Examples:

- Spending over time
- Budget vs Actual
- Category distribution
- Invoice evolution

---

### Section 3

Action Center

Contains small actionable widgets.

Examples:

## Quotes awaiting validation ("À confirmer")

Show:

- latest 5

CTA

View all →

opens Transactions page

filtered on:

Quote + Pending

---

## Unpaid invoices

Show:

latest 5

CTA

View all →

opens Transactions page

filtered on:

Invoice + Unpaid

---

## Recent transactions

Show:

latest 5

CTA

View all →

opens Transactions page

sorted by newest

---

## Missing documents

Show:

transactions without attached documents

CTA

View all →

opens Transactions page

filtered on:

Missing documents

---

## Budget alerts

Examples:

- Budget exceeded
- High variance
- Products without budget
- Missing supplier

Each alert links directly to the corresponding Budget item.

---

# Navigation Philosophy

Dashboard

↓

Monitor

Budget

↓

Build & maintain

Transactions

↓

Operate

Suppliers

↓

Manage companies

Documents

↓

Browse project files

Settings

↓

Configure application

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

Status

- [ ] Not Started
- [ ] In Progress
- [ ] Completed

---

## Chunk 2 — Filters

Goal

Implement operational filtering.

Tasks

- Type
- Status
- Supplier
- Date
- Budget selection
- Missing documents

Deliverable

Fast transaction lookup.

Status

- [ ] Not Started
- [ ] In Progress
- [ ] Completed

---

## Chunk 3 — Dashboard Redesign

Goal

Transform Dashboard into a monitoring page.

Tasks

- KPI cards
- Charts
- Action Center
- Dashboard widgets

Deliverable

Executive project overview.

Status

- [ ] Not Started
- [ ] In Progress
- [ ] Completed

---

## Chunk 4 — Deep Linking

Goal

Connect Dashboard widgets to Transactions.

Examples

Unpaid invoices

↓

Transactions

↓

Invoice + Unpaid filter

Recent transactions

↓

Transactions

↓

Latest first

Deliverable

Seamless navigation.

Status

- [ ] Not Started
- [ ] In Progress
- [ ] Completed

---

## Chunk 5 — Polish

Tasks

- Empty states
- Loading states
- Error states
- Keyboard shortcuts
- Responsive behavior
- Performance review

Deliverable

Production-ready transaction experience.

Status

- [ ] Not Started
- [ ] In Progress
- [ ] Completed

---

# Final Vision

The application offers three complementary perspectives over the same project data:

**Dashboard**
Executive monitoring and actionable summaries.

**Budget**
Hierarchical construction budget management.

**Transactions**
Operational workspace for reviewing, searching, updating and completing every project transaction.

Together, these three pages cover the complete lifecycle of day-to-day construction budget management without duplicating functionality or overloading a single interface.
