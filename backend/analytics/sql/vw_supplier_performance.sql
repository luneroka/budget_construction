------------------------------------------------------------
-- Supplier Performance View
------------------------------------------------------------
-- Grain:
-- One row per supplier per project.
--
-- Purpose:
-- Supplier spend, invoice and variance analysis.
------------------------------------------------------------

create or replace view analytics.vw_supplier_performance as
with supplier_metrics as (
    select
        pj.id as project_id,
        pj.name as project_name,
        s.id as supplier_id,
        s.name as supplier_name,

        count(
            distinct case
                when t.transaction_type = 'invoice'
                then t.id
            end
        ) as invoice_count,

        count(
            distinct case
                when t.transaction_type = 'invoice'
                 and t.payment_date is not null
                 and t.due_date is not null
                 and t.payment_date > t.due_date
                then t.id
            end
        ) as late_invoice_count,

        coalesce(
            sum(
                case
                    when t.transaction_type = 'quote'
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as quoted_amount_ttc,

        coalesce(
            sum(
                case
                    when t.transaction_type = 'invoice'
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as actual_amount_ttc,

        coalesce(
            sum(
                case
                    when t.transaction_type = 'invoice'
                     and t.invoice_status = 'paid'
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as paid_amount_ttc,

        coalesce(
            sum(
                case
                    when t.transaction_type = 'invoice'
                     and t.invoice_status = 'unpaid'
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as unpaid_amount_ttc

    from projects pj
    left join project_items pi
        on pj.id = pi.project_id
        and pi.deleted_at is null
    left join transactions t
        on pi.id = t.project_item_id
        and t.deleted_at is null
    left join suppliers s
        on t.supplier_id = s.id
        and s.deleted_at is null

    where pj.deleted_at is null
      and s.id is not null

    group by
        pj.id,
        pj.name,
        s.id,
        s.name
)

select
    project_id,
    project_name,
    supplier_id,
    supplier_name,
    invoice_count,
    quoted_amount_ttc,
    actual_amount_ttc,
    paid_amount_ttc,
    unpaid_amount_ttc,
    quoted_amount_ttc - actual_amount_ttc as variance_ttc,
    round(
        (
            (quoted_amount_ttc - actual_amount_ttc)
            / nullif(quoted_amount_ttc, 0)
        ) * 100,
        2
    ) as variance_pct,
    late_invoice_count
from supplier_metrics;