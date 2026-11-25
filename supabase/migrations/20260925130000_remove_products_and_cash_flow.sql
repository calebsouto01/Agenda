-- Remove produtos, estoque e o fluxo de caixa manual: o app é de agendamento.
-- O pagamento do atendimento (payment_entries) continua.
-- ATENÇÃO: aplicar SOMENTE depois que o site sem essas telas estiver no ar.

drop trigger if exists product_movements_apply on public.product_movements;
drop function if exists public.apply_product_movement();

drop table if exists public.product_movements;
drop table if exists public.products;
drop table if exists public.cash_movements;

drop type if exists public.product_movement_type;
drop type if exists public.cash_movement_type;

alter table public.establishments drop column if exists sells_products;
