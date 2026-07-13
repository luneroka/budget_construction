------------------------------------------------------------
-- Transactions Fact View
------------------------------------------------------------
-- Grain:
-- One row per transaction.
--
-- Purpose:
-- Central fact table for Power BI reporting.
-- Combines transaction, project, supplier and catalog data
-- to support:
--   - Spending analysis
--   - Budget vs actual reporting
--   - Supplier performance analysis
--   - Payment tracking
--   - Cashflow reporting
--
-- Source tables:
-- transactions
-- project_items
-- projects
-- suppliers
-- products
-- subcategories
-- categories
------------------------------------------------------------

create or replace view analytics.vw_transactions_fact as
select
    t.id as transaction_id,
    pj.id as project_id,
    pj.name as project_name,
    t.project_item_id,
    pi.name as project_item_name,
    t.supplier_id,
    s.name as supplier_name,
    c.name as category_name,
    sc.name as subcategory_name,
    pd.name as product_name,
    t.transaction_type,
    t.quote_status,
    t.invoice_status,
    t.is_selected_budget,
    t.amount_ht,
    t.amount_vat,
    t.amount_ttc,
    t.issued_date,
    t.due_date,
    t.payment_date,

    case
        when t.transaction_type = 'invoice'
         and t.payment_date is not null
         and t.due_date is not null
        then t.payment_date - t.due_date
    end as payment_delay_days_raw,

    case
        when t.transaction_type = 'invoice'
         and t.payment_date is not null
         and t.due_date is not null
        then greatest(t.payment_date - t.due_date, 0)
    end as payment_delay_days,

    case
        when t.transaction_type = 'invoice'
         and t.payment_date is not null
         and t.due_date is not null
         and t.payment_date > t.due_date
        then 1
        else 0
    end as is_late_payment

from transactions t
left join project_items pi
    on t.project_item_id = pi.id
left join projects pj
    on pi.project_id = pj.id
left join suppliers s
    on t.supplier_id = s.id
left join products pd
    on pi.product_id = pd.id
left join subcategories sc
    on pd.subcategory_id = sc.id
left join categories c
    on sc.category_id = c.id

where t.deleted_at is null
  and pi.deleted_at is null
  and pj.deleted_at is null;