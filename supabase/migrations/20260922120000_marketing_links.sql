-- Módulo de Marketing, fase 1 (criar e medir): link de agendamento rastreado
-- + painel de resultados. Cada link criado no painel aponta pra uma rota
-- pública curta (/l/{code}) que registra o clique, redireciona pra página de
-- agendamento do estabelecimento e carrega a atribuição até o agendamento
-- final, sem depender de UTM em ferramenta nenhuma de fora.

CREATE TYPE public.marketing_channel AS ENUM ('instagram', 'facebook', 'whatsapp', 'anuncio', 'outro');

CREATE TABLE public.marketing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  label text NOT NULL,
  channel public.marketing_channel NOT NULL DEFAULT 'outro',
  code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(5), 'hex'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.marketing_links (establishment_id, created_at DESC);

ALTER TABLE public.marketing_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages marketing links" ON public.marketing_links FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_links TO authenticated;
GRANT ALL ON public.marketing_links TO service_role;

-- Cliques ficam numa tabela própria (sem dado pessoal) pra separar "quantas
-- pessoas abriram o link" de "quantos agendamentos ele gerou". Só a função
-- resolve_marketing_link (abaixo) grava aqui; o dono só lê.
CREATE TABLE public.marketing_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.marketing_links ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.marketing_link_clicks (link_id);

ALTER TABLE public.marketing_link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads marketing link clicks" ON public.marketing_link_clicks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.marketing_links ml
    WHERE ml.id = link_id AND public.owns_establishment(ml.establishment_id)
  ));

GRANT SELECT ON public.marketing_link_clicks TO authenticated;
GRANT ALL ON public.marketing_link_clicks TO service_role;

ALTER TABLE public.appointments
  ADD COLUMN marketing_link_id uuid REFERENCES public.marketing_links ON DELETE SET NULL;
CREATE INDEX ON public.appointments (marketing_link_id);

-- Chamada pela rota pública /l/{code}: registra o clique e devolve o slug do
-- estabelecimento pra onde redirecionar. SECURITY DEFINER porque quem chama
-- ainda não tem sessão nenhuma (visitante anônimo clicando no link).
CREATE OR REPLACE FUNCTION public.resolve_marketing_link(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link_id uuid;
  v_establishment_id uuid;
  v_slug text;
BEGIN
  SELECT id, establishment_id INTO v_link_id, v_establishment_id
  FROM public.marketing_links WHERE code = p_code AND active;

  IF v_link_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  INSERT INTO public.marketing_link_clicks (link_id) VALUES (v_link_id);

  SELECT slug INTO v_slug FROM public.establishments WHERE id = v_establishment_id;

  RETURN jsonb_build_object('found', true, 'slug', v_slug, 'code', p_code);
END; $$;

GRANT EXECUTE ON FUNCTION public.resolve_marketing_link(text) TO anon, authenticated;

-- Agregado por link pro painel de resultados: cliques, agendamentos (exceto
-- cancelados), comparecimentos (concluídos) e faturamento (soma dos
-- pagamentos lançados nos agendamentos daquele link).
CREATE OR REPLACE FUNCTION public.marketing_link_stats(p_establishment_id uuid)
RETURNS TABLE (
  link_id uuid,
  clicks bigint,
  agendamentos bigint,
  comparecimentos bigint,
  faturamento_cents bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    ml.id,
    (SELECT count(*) FROM public.marketing_link_clicks c WHERE c.link_id = ml.id),
    (SELECT count(*) FROM public.appointments a WHERE a.marketing_link_id = ml.id AND a.status <> 'cancelled'),
    (SELECT count(*) FROM public.appointments a WHERE a.marketing_link_id = ml.id AND a.status = 'completed'),
    (SELECT coalesce(sum(pe.amount_cents), 0) FROM public.payment_entries pe
       JOIN public.appointments a ON a.id = pe.appointment_id
       WHERE a.marketing_link_id = ml.id)
  FROM public.marketing_links ml
  WHERE ml.establishment_id = p_establishment_id
    AND public.owns_establishment(p_establishment_id);
$$;

GRANT EXECUTE ON FUNCTION public.marketing_link_stats(uuid) TO authenticated;

-- book_appointment ganha um parâmetro opcional de código de link: quando o
-- agendamento público chega com ?ref=<code>, grava a atribuição no próprio
-- agendamento. Resto da função é idêntico ao anterior.
DROP FUNCTION IF EXISTS public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text, uuid[]);

CREATE FUNCTION public.book_appointment(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_service_ids uuid[] DEFAULT NULL,
  p_marketing_link_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duration int;
  v_total_price_cents int;
  v_service_names text;
  v_multi boolean := p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 1;
  v_ends_at timestamptz;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_marketing_link_id uuid;
  v_name text := btrim(p_customer_name);
  v_phone text := btrim(p_customer_phone);
  v_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Informe um nome válido';
  END IF;
  IF length(regexp_replace(v_phone, '\D', '', 'g')) < 8 OR length(v_phone) > 30 THEN
    RAISE EXCEPTION 'Informe um telefone válido';
  END IF;
  IF v_email IS NOT NULL AND (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 200) THEN
    RAISE EXCEPTION 'Informe um e-mail válido';
  END IF;
  IF p_starts_at <= now() THEN
    RAISE EXCEPTION 'Escolha um horário futuro';
  END IF;

  IF v_multi THEN
    SELECT sum(duration_minutes), sum(price_cents), string_agg(name, ' + ' ORDER BY name)
    INTO v_duration, v_total_price_cents, v_service_names
    FROM public.services
    WHERE id = ANY(p_service_ids) AND establishment_id = p_establishment_id AND active;
    IF v_duration IS NULL THEN RAISE EXCEPTION 'Serviço indisponível'; END IF;
  ELSE
    SELECT duration_minutes INTO v_duration FROM public.services
    WHERE id = p_service_id AND establishment_id = p_establishment_id AND active;
    IF v_duration IS NULL THEN RAISE EXCEPTION 'Serviço indisponível'; END IF;
  END IF;

  IF p_professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = p_professional_id AND establishment_id = p_establishment_id AND active
  ) THEN RAISE EXCEPTION 'Profissional indisponível'; END IF;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  IF NOT EXISTS (
    SELECT 1 FROM public.available_slots(
      p_establishment_id, p_service_id, p_professional_id,
      (p_starts_at AT TIME ZONE (SELECT timezone FROM public.establishments WHERE id = p_establishment_id))::date,
      p_service_ids
    ) s
    WHERE s = p_starts_at
  ) THEN
    RAISE EXCEPTION 'Este horário não está mais disponível';
  END IF;

  IF p_marketing_link_code IS NOT NULL THEN
    SELECT id INTO v_marketing_link_id FROM public.marketing_links
    WHERE code = p_marketing_link_code AND establishment_id = p_establishment_id AND active;
  END IF;

  INSERT INTO public.customers (establishment_id, name, phone, email)
  VALUES (p_establishment_id, v_name, v_phone, v_email)
  ON CONFLICT (establishment_id, phone)
  DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, public.customers.email)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.appointments (
    establishment_id, service_id, professional_id, customer_id, starts_at, ends_at,
    status, notes, service_names, total_price_cents, marketing_link_id
  )
  VALUES (
    p_establishment_id, p_service_id, p_professional_id, v_customer_id, p_starts_at, v_ends_at,
    'pending', nullif(btrim(coalesce(p_notes,'')),''), v_service_names, v_total_price_cents, v_marketing_link_id
  )
  RETURNING id INTO v_appointment_id;

  INSERT INTO public.notification_queue (establishment_id, appointment_id, channel, event, payload)
  VALUES
    (p_establishment_id, v_appointment_id, 'whatsapp', 'appointment_created', jsonb_build_object('phone', v_phone, 'name', v_name, 'starts_at', p_starts_at)),
    (p_establishment_id, v_appointment_id, 'email', 'appointment_created', jsonb_build_object('email', v_email, 'name', v_name, 'starts_at', p_starts_at));

  RETURN jsonb_build_object('appointment_id', v_appointment_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at);
END; $$;

GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text, uuid[], text) TO anon, authenticated;

-- O lead automático do Funil passa a herdar a origem do link de marketing
-- quando o agendamento veio de um; sem link, continua 'Agendamento' como
-- antes.
CREATE OR REPLACE FUNCTION public.create_funnel_lead_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_origem text := 'Agendamento';
  v_label text;
BEGIN
  SELECT name, phone INTO v_name, v_phone FROM public.customers WHERE id = NEW.customer_id;
  IF v_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.marketing_link_id IS NOT NULL THEN
    SELECT label INTO v_label FROM public.marketing_links WHERE id = NEW.marketing_link_id;
    IF v_label IS NOT NULL THEN
      v_origem := 'Marketing: ' || v_label;
    END IF;
  END IF;

  INSERT INTO public.crm_leads (establishment_id, customer_id, appointment_id, name, phone, origem, stage)
  VALUES (NEW.establishment_id, NEW.customer_id, NEW.id, v_name, v_phone, v_origem, 'mensagem_1');

  RETURN NEW;
END;
$$;
