----------------------------------------------
-- Project summary view
----------------------------------------------

create or replace view analytics.vw_project_summary as
with project_metrics as (
    select
        p.id as project_id,
        p.name as project_name,
        p.location,
        p.start_date,
        p.end_date,
        p.project_status,

        coalesce(
            sum(
                case
                    when t.is_selected_budget is true
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as total_selected_budget_ttc,

        coalesce(
            sum(
                case
                    when t.transaction_type = 'invoice'
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as total_actual_ttc,

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
        ) as total_paid_ttc,

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
        ) as total_unpaid_ttc,

        count(distinct t.supplier_id) as supplier_count,
        count(distinct pi.id) as project_item_count,
        count(
            distinct case
                when t.transaction_type = 'invoice'
                then t.id
            end
        ) as invoice_count

    from projects p
    left join project_items pi
        on p.id = pi.project_id
        and pi.deleted_at is null
    left join transactions t
        on pi.id = t.project_item_id
        and t.deleted_at is null

    where p.deleted_at is null

    group by
        p.id,
        p.name,
        p.location,
        p.start_date,
        p.end_date,
        p.project_status
)

select
    project_id,
    project_name,
    location,
    start_date,
    end_date,
    project_status,
    total_selected_budget_ttc,
    total_actual_ttc,
    total_paid_ttc,
    total_unpaid_ttc,
    total_selected_budget_ttc - total_actual_ttc as total_variance_ttc,
    round(
        (
            (total_selected_budget_ttc - total_actual_ttc)
            / nullif(total_selected_budget_ttc, 0)
        ) * 100,
        2
    ) as total_variance_pct,
    round(
        (
            total_actual_ttc
            / nullif(total_selected_budget_ttc, 0)
        ) * 100,
        2
    ) as actual_vs_budget_pct,
    supplier_count,
    project_item_count,
    invoice_count
from project_metrics;