-- Telefone de cliente estava sendo gravado como o usuário digitou, sem
-- normalizar. Como a unicidade de public.customers é (establishment_id,
-- phone) sobre o texto puro, "(11) 99999-9999", "11999999999" e
-- "11 99999-9999" contam como três clientes diferentes — foi o que causou
-- 4 cadastros pro mesmo cliente de teste. Passa a normalizar pros últimos
-- 11 dígitos (mesma regra já usada em normalizePhone no frontend) antes de
-- gravar, e mescla os duplicados que já existem.

-- 1) book_appointment: normaliza o telefone antes do upsert em customers.
CREATE OR REPLACE FUNCTION public.book_appointment(
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
  v_phone text := right(regexp_replace(btrim(coalesce(p_customer_phone, '')), '\D', '', 'g'), 11);
  v_email text := nullif(btrim(coalesce(p_customer_email, '')), '');
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Informe um nome válido';
  END IF;
  IF length(v_phone) < 8 THEN
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

-- 2) Mescla clientes duplicados por telefone não normalizado: reatribui
-- agendamentos e leads do Funil pro registro mais antigo de cada grupo, e
-- apaga os demais.
DO $$
DECLARE
  rec record;
  v_canonical_id uuid;
BEGIN
  FOR rec IN
    SELECT establishment_id, right(regexp_replace(phone, '\D', '', 'g'), 11) AS normalized
    FROM public.customers
    GROUP BY establishment_id, right(regexp_replace(phone, '\D', '', 'g'), 11)
    HAVING count(*) > 1
  LOOP
    SELECT id INTO v_canonical_id
    FROM public.customers
    WHERE establishment_id = rec.establishment_id
      AND right(regexp_replace(phone, '\D', '', 'g'), 11) = rec.normalized
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    UPDATE public.appointments
    SET customer_id = v_canonical_id
    WHERE customer_id IN (
      SELECT id FROM public.customers
      WHERE establishment_id = rec.establishment_id
        AND right(regexp_replace(phone, '\D', '', 'g'), 11) = rec.normalized
        AND id <> v_canonical_id
    );

    UPDATE public.crm_leads
    SET customer_id = v_canonical_id
    WHERE customer_id IN (
      SELECT id FROM public.customers
      WHERE establishment_id = rec.establishment_id
        AND right(regexp_replace(phone, '\D', '', 'g'), 11) = rec.normalized
        AND id <> v_canonical_id
    );

    DELETE FROM public.customers
    WHERE establishment_id = rec.establishment_id
      AND right(regexp_replace(phone, '\D', '', 'g'), 11) = rec.normalized
      AND id <> v_canonical_id;
  END LOOP;
END $$;

-- 3) Normaliza o telefone dos clientes que restaram (agora sem duplicidade).
UPDATE public.customers
SET phone = right(regexp_replace(phone, '\D', '', 'g'), 11)
WHERE phone <> right(regexp_replace(phone, '\D', '', 'g'), 11);
