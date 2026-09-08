-- Módulo 1: financeiro (fluxo de caixa manual + estoque) e módulo 2: CRM
-- (pipeline de leads + atividades), inspirado na estrutura de CRM do projeto
-- "engenharia" (crm_clientes/crm_leads/crm_atividades) e adaptado ao domínio
-- de agendamentos da Agenda.

-- ---------------------------------------------------------------------------
-- Fluxo de caixa: lançamentos manuais de entrada/saída (aluguel, fornecedores,
-- outras receitas) que somam com a receita de agendamentos (payment_entries)
-- e de vendas de produtos (product_movements) já existentes.
-- ---------------------------------------------------------------------------
CREATE TYPE public.cash_movement_type AS ENUM ('entrada', 'saida');

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  type public.cash_movement_type NOT NULL,
  category text NOT NULL,
  description text,
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  occurred_at date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.cash_movements (establishment_id, occurred_at);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages cash movements" ON public.cash_movements FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

-- ---------------------------------------------------------------------------
-- Estoque: só faz sentido para estabelecimentos que vendem produtos, controlado
-- pela flag establishments.sells_products.
-- ---------------------------------------------------------------------------
ALTER TABLE public.establishments ADD COLUMN sells_products boolean NOT NULL DEFAULT false;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  price_cents int NOT NULL DEFAULT 0,
  cost_cents int NOT NULL DEFAULT 0,
  stock_qty int NOT NULL DEFAULT 0,
  min_stock_qty int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.products (establishment_id);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages products" ON public.products FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

CREATE TYPE public.product_movement_type AS ENUM ('entrada', 'saida', 'venda', 'ajuste');

CREATE TABLE public.product_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products ON DELETE CASCADE,
  type public.product_movement_type NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  unit_price_cents int NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.product_movements (establishment_id, created_at);
CREATE INDEX ON public.product_movements (product_id);

ALTER TABLE public.product_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages product movements" ON public.product_movements FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_movements TO authenticated;
GRANT ALL ON public.product_movements TO service_role;

-- Mantém products.stock_qty consistente com o histórico de movimentos, e
-- bloqueia saída/venda que deixaria o estoque negativo.
CREATE OR REPLACE FUNCTION public.apply_product_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current int;
BEGIN
  SELECT stock_qty INTO v_current FROM public.products WHERE id = NEW.product_id FOR UPDATE;

  IF NEW.type = 'entrada' THEN
    UPDATE public.products SET stock_qty = v_current + NEW.qty WHERE id = NEW.product_id;
  ELSIF NEW.type IN ('saida', 'venda') THEN
    IF v_current - NEW.qty < 0 THEN
      RAISE EXCEPTION 'Estoque insuficiente';
    END IF;
    UPDATE public.products SET stock_qty = v_current - NEW.qty WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    UPDATE public.products SET stock_qty = NEW.qty WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER product_movements_apply AFTER INSERT ON public.product_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_product_movement();

-- ---------------------------------------------------------------------------
-- CRM: notas por cliente + pipeline de leads (pré-agendamento) + atividades de
-- acompanhamento, mesma estrutura de crm_leads/crm_atividades do projeto
-- "engenharia", adaptada (etapas do funil de agendamento em vez de obra).
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers ADD COLUMN notes text;

CREATE TYPE public.crm_lead_stage AS ENUM ('novo', 'contato', 'agendado', 'convertido', 'perdido');

CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  origem text NOT NULL DEFAULT 'outro',
  stage public.crm_lead_stage NOT NULL DEFAULT 'novo',
  valor_estimado_cents int,
  responsavel_id uuid REFERENCES public.professionals ON DELETE SET NULL,
  notes text,
  motivo_perda text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (stage <> 'perdido' OR motivo_perda IS NOT NULL)
);
CREATE INDEX ON public.crm_leads (establishment_id, stage);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages crm leads" ON public.crm_leads FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT ALL ON public.crm_leads TO service_role;

CREATE TYPE public.crm_activity_type AS ENUM ('ligacao', 'whatsapp', 'visita', 'email', 'outro');
CREATE TYPE public.crm_activity_status AS ENUM ('pendente', 'concluida', 'cancelada');

CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  lead_id uuid REFERENCES public.crm_leads ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers ON DELETE CASCADE,
  type public.crm_activity_type NOT NULL DEFAULT 'outro',
  description text NOT NULL,
  due_date date,
  status public.crm_activity_status NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL)
);
CREATE INDEX ON public.crm_activities (establishment_id, status, due_date);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages crm activities" ON public.crm_activities FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
