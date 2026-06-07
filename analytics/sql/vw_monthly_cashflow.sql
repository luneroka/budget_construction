------------------------------------------------------------
-- Monthly Cashflow View
------------------------------------------------------------
-- Grain:
-- One row per project per month.
--
-- Purpose:
-- Time-series reporting and cashflow analysis.
------------------------------------------------------------

create or replace view analytics.vw_monthly_cashflow as
with monthly_metrics as (
    select
        pj.id as project_id,
        pj.name as project_name,
        date_trunc('month', t.payment_date)::date as month,

        coalesce(
            sum(t.amount_ttc),
            0
        ) as paid_amount_ttc

    from projects pj
    left join project_items pi
        on pj.id = pi.project_id
        and pi.deleted_at is null
    left join transactions t
        on pi.id = t.project_item_id
        and t.deleted_at is null
        and t.transaction_type = 'invoice'

    where pj.deleted_at is null
      and t.payment_date is not null

    group by
        pj.id,
        pj.name,
        date_trunc('month', t.payment_date)::date
)

select
    project_id,
    project_name,
    month,
    paid_amount_ttc,

    sum(paid_amount_ttc)
        over (
            partition by project_id
            order by month
            rows between unbounded preceding and current row
        ) as cumulative_paid_amount_ttc

from monthly_metrics;