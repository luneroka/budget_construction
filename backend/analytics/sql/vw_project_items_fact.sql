------------------------------------------------------------
-- Project Items Fact View
------------------------------------------------------------
-- Grain:
-- One row per project item.
--
-- Purpose:
-- Budget vs actual analysis at project item level.
------------------------------------------------------------

create or replace view analytics.vw_project_items_fact as
with project_item_metrics as (
    select
        pj.id as project_id,
        pj.name as project_name,
        pi.id as project_item_id,
        pi.name as project_item_name,
        c.name as category_name,
        sc.name as subcategory_name,
        pd.name as product_name,

        coalesce(
            sum(
                case
                    when t.is_selected_budget is true
                    then t.amount_ttc
                    else 0
                end
            ),
            0
        ) as selected_budget_amount_ttc,

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
        ) as unpaid_amount_ttc,

        count(
            distinct case
                when t.transaction_type = 'invoice'
                then t.id
            end
        ) as invoice_count

    from projects pj
    left join project_items pi
        on pj.id = pi.project_id
        and pi.deleted_at is null
    left join products pd
        on pi.product_id = pd.id
    left join subcategories sc
        on pd.subcategory_id = sc.id
    left join categories c
        on sc.category_id = c.id
    left join transactions t
        on pi.id = t.project_item_id
        and t.deleted_at is null

    where pj.deleted_at is null

    group by
        pj.id,
        pj.name,
        pi.id,
        pi.name,
        c.name,
        sc.name,
        pd.name
)

select
    project_id,
    project_name,
    project_item_id,
    project_item_name,
    category_name,
    subcategory_name,
    product_name,
    selected_budget_amount_ttc,
    actual_amount_ttc,
    paid_amount_ttc,
    unpaid_amount_ttc,
    selected_budget_amount_ttc - actual_amount_ttc as variance_ttc,
    round(
        (
            (selected_budget_amount_ttc - actual_amount_ttc)
            / nullif(selected_budget_amount_ttc, 0)
        ) * 100,
        2
    ) as variance_pct,
    invoice_count,
    case
        when invoice_count > 0 then 1
        else 0
    end as has_invoice
from project_item_metrics;