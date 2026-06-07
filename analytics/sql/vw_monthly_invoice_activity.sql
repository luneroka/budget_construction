------------------------------------------------------------
-- Monthly Invoice Activity View
------------------------------------------------------------
-- Grain:
-- One row per project per invoice month.
--
-- Purpose:
-- Supports budget monitoring, invoice lifecycle analysis,
-- cumulative spending trends, and outstanding invoice tracking.
------------------------------------------------------------

create or replace view analytics.vw_monthly_invoice_activity as
with monthly_metrics as (
    select
        pj.id as project_id,
        pj.name as project_name,
        date_trunc('month', t.issued_date)::date as month,

        coalesce(
            sum(t.amount_ttc),
            0
        ) as invoice_amount_ttc,

        coalesce(
            sum(
                case
                    when t.invoice_status = 'paid'
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as paid_amount_ttc,

        coalesce(
            sum(
                case
                    when t.invoice_status = 'unpaid'
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
        and t.transaction_type = 'invoice'

    where pj.deleted_at is null
      and t.issued_date is not null

    group by
        pj.id,
        pj.name,
        date_trunc('month', t.issued_date)::date
)

select
    project_id,
    project_name,
    month,
    invoice_amount_ttc,
    paid_amount_ttc,
    unpaid_amount_ttc,

    sum(invoice_amount_ttc)
        over (
            partition by project_id
            order by month
            rows between unbounded preceding and current row
        ) as cumulative_invoice_amount_ttc,

    sum(paid_amount_ttc)
        over (
            partition by project_id
            order by month
            rows between unbounded preceding and current row
        ) as cumulative_paid_amount_ttc,

    sum(unpaid_amount_ttc)
        over (
            partition by project_id
            order by month
            rows between unbounded preceding and current row
        ) as cumulative_unpaid_amount_ttc

from monthly_metrics;