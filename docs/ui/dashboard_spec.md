# Dashboard Design

## Philosophy

The Dashboard is designed as an executive monitoring page, not another transaction management interface. It aims to answer three fundamental questions:

- Where am I?
- What needs my attention?
- How is the project evolving?

All operational actions are delegated to specialized pages such as Budget, Transactions, Suppliers, and Documents through deep links to maintain focus and clarity.

### Migration Strategy

Treat the current Dashboard as a UI prototype, not as business logic.

The existing Dashboard already contains reusable UI components that should serve as the foundation for the final implementation. During the redesign:

- Preserve reusable presentation components (KPI cards, chart containers, widget cards, section layouts, loading skeletons and empty states).
- Replace every mock dataset with data coming from the backend Financial Engine and Dashboard read models.
- Refactor existing components whenever their structure is reusable but their business content no longer matches the final product.
- Remove components that only existed to showcase the initial shell or mock data.

The objective is to maximize reuse of the current UI while rebuilding the Dashboard around the real backend rather than around mock business logic.

## Dashboard Layout

### Section 1 – Financial KPIs

This section features KPI cards highlighting key financial metrics:

- Selected Budget
- Actual Spend
- Remaining Budget
- Budget Variance
- Budget Completion %

Each card provides a concise summary and links to the relevant page when appropriate to enable quick access to detailed information.

### Section 2 – Charts

The dashboard includes various charts to visualize financial data and project progress:

- Spending over time
- Budget vs Actual
- Category distribution
- Supplier distribution

These charts reuse projections from the Financial Engine and are strictly read-only, ensuring consistency and accuracy.

### Section 3 – Action Center

Instead of editable tables, this section contains operational widgets that surface important actionable items:

- Unpaid invoices
- Quotes awaiting validation
- Quotes to negotiate
- Missing documents
- Recent transactions
- Budget alerts

Each widget displays a limited number of recent items and provides a "View all" action that deep-links into the Transactions page with the corresponding Quick View or filter already applied.

## Navigation Philosophy

The application’s navigation is designed around clear responsibilities:

- Dashboard → Monitor overall project health and status
- Budget → Build and maintain the hierarchical construction budget
- Transactions → Operate day-to-day financial transactions
- Suppliers → Manage supplier information and relationships
- Documents → Manage project-related documents

This separation ensures users have focused workflows without overlapping functionality.

Each Dashboard chunk may require a small amount of backend work before the corresponding frontend implementation. These backend prerequisites are intentionally documented alongside each chunk so the Dashboard can be developed feature-by-feature without maintaining a separate backend roadmap.

---

## Chunk 1 – KPI cards

**Goal**  
Develop KPI cards to display key financial metrics prominently on the Dashboard.

**Backend prerequisites**

- Extend the Financial Engine to expose dashboard KPI projections.
- Extend financial KPIs (remaining budget, completion %, variance, forecast if available).
- Create optimized Dashboard read models/projections exposing only the data required by KPI cards.

**Tasks**

- Implement cards for Selected Budget, Actual Spend, Remaining Budget, Budget Variance, and Budget Completion %.
- Ensure cards link to relevant pages where appropriate.
- Style cards for clarity and quick comprehension.

**Deliverable**  
Interactive KPI cards integrated into the Dashboard.

**Status**: Completed.

---

## Chunk 2 – Charts

**Goal**  
Create charts to visualize financial data and project trends on the Dashboard.

**Backend prerequisites**

- Add category financial projections.
- Add supplier financial projections.
- Ensure all charts reuse Financial Engine projections rather than computing values in the frontend.

**Tasks**

- Develop charts for Spending over time, Budget vs Actual, Category distribution, and Supplier distribution.
- Integrate Financial Engine projections as data sources.
- Ensure charts are read-only and visually clear.

**Deliverable**  
Functional and visually appealing charts on the Dashboard.

**Status**: Completed.

---

## Chunk 3 – Action Center widgets

**Goal**  
Implement operational widgets to surface actionable items within the Dashboard.

**Backend prerequisites**

- Finalize transaction lifecycle and status logic (quotes, DIY estimates, invoices).
- Implement project health indicators (missing documents, missing selected budgets, unpaid invoices, etc.).
- Extend Dashboard read models to expose Action Center widgets efficiently.

**Tasks**

- Develop widgets for Unpaid invoices, Quotes awaiting validation, Quotes to negotiate, Missing documents, Recent transactions, and Budget alerts.
- Limit displayed items to recent entries and provide "View all" deep links.
- Ensure widgets link to Transactions or other relevant pages with filters applied.

**Deliverable**  
Action Center with operational widgets integrated into the Dashboard.

**Status**: Completed.

---

## Chunk 4 – Dashboard Navigation & Quick Actions

**Goal**

Turn the Dashboard into an operational cockpit by allowing users to process Action Center items directly while preserving access to the full workspaces.

**Backend prerequisites**

- Ensure Dashboard read models expose the identifiers required to open the existing Transaction modal directly.
- Ensure Dashboard read models expose the identifiers required for navigation to Budget, Transactions, Suppliers and Documents.
- Ensure widget queries refresh correctly after transaction updates.

**Tasks**

- Make Action Center rows clickable.
- Reuse the existing Transaction modal; do not create a Dashboard-specific editing workflow.
- Clicking an item from the following widgets opens the Transaction modal directly:
  - Unpaid invoices
  - Quotes awaiting validation
  - Quotes to negotiate
  - Missing documents
  - Recent transactions
- After saving changes, automatically invalidate the relevant React Query caches so the widget refreshes immediately.
- If the updated transaction no longer matches the widget criteria, remove it from the queue and allow the next item to appear automatically.
- Keep the existing "Voir tout" action as a secondary workflow that navigates to the Transactions page with the corresponding Quick View already selected.
- Budget alerts remain an exception: clicking an alert should navigate to the Budget page focused on the affected product or budget line rather than opening the Transaction modal.

**Deliverable**

An Action Center supporting both immediate processing through the Transaction modal and navigation to the complete operational workspaces.

**Status**: Completed.

---

## Chunk 5 – Polish

**Goal**  
Refine the Dashboard to ensure a production-ready, user-friendly experience.

**Backend prerequisites**

- Review Dashboard endpoints for performance.
- Optimize read models if necessary.
- Note that Reporting & Export is intentionally excluded from this roadmap and will be implemented as a separate feature reusing the Financial Engine.

**Tasks**

- [x] Implement empty states for widgets and charts.
- [x] Add loading states for data fetching.
- [ ] Ensure responsive behavior across devices.
- [ ] Enhance accessibility compliance.
- [ ] Optimize performance for fast load times.

**Deliverable**  
A polished and robust Dashboard experience.

**Status**: In Progress. Loading skeletons (`DashboardKpiSkeleton`, `DashboardChartSkeleton`) and empty-state messaging are implemented; responsive, accessibility, and performance passes are still open.

---

# Final Vision

Dashboard, Budget, and Transactions represent three complementary perspectives over the same project data. The Dashboard serves as the application’s landing page after login, providing executive monitoring and actionable insights. Budget focuses on building and maintaining the hierarchical construction budget. Transactions provide an operational workspace for reviewing, searching, updating, and completing every project transaction. Together, these perspectives cover the complete lifecycle of day-to-day construction budget management without duplicating functionality or overloading any single interface.
