-- Lets a client pick more than one service in the same online booking. Stored
-- as a single combined appointment: duration and price are summed, and the
-- chosen service names are kept as a display label (service_names). A
-- single-service booking is unaffected — these columns stay NULL and the
-- app keeps reading price/name from the normal services join.
ALTER TABLE public.appointments
  ADD COLUMN service_names text,
  ADD COLUMN total_price_cents integer;

DROP FUNCTION IF EXISTS public.available_slots(uuid, uuid, uuid, date);

CREATE FUNCTION public.available_slots(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_date date,
  p_service_ids uuid[] DEFAULT NULL
) RETURNS SETOF timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz text;
  v_step int;
  v_duration int;
  v_open time;
  v_close time;
  v_break_start time;
  v_break_end time;
  v_closed boolean;
  v_weekday int;
  v_cursor timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_break_start_ts timestamptz;
  v_break_end_ts timestamptz;
  v_slot_end timestamptz;
BEGIN
  SELECT timezone, slot_step_minutes INTO v_tz, v_step
  FROM public.establishments WHERE id = p_establishment_id;
  IF v_tz IS NULL THEN RETURN; END IF;

  IF p_service_ids IS NOT NULL AND array_length(p_service_ids, 1) > 0 THEN
    SELECT sum(duration_minutes) INTO v_duration
    FROM public.services
    WHERE id = ANY(p_service_ids) AND establishment_id = p_establishment_id AND active;
  ELSE
    SELECT duration_minutes INTO v_duration
    FROM public.services
    WHERE id = p_service_id AND establishment_id = p_establishment_id AND active;
  END IF;
  IF v_duration IS NULL THEN RETURN; END IF;

  v_weekday := EXTRACT(DOW FROM p_date)::int;
  SELECT opens_at, closes_at, closed, break_start, break_end
  INTO v_open, v_close, v_closed, v_break_start, v_break_end
  FROM public.business_hours
  WHERE establishment_id = p_establishment_id AND weekday = v_weekday;
  IF v_open IS NULL OR v_closed THEN RETURN; END IF;

  v_day_start := ((p_date::text || ' ' || v_open::text)::timestamp) AT TIME ZONE v_tz;
  v_day_end := ((p_date::text || ' ' || v_close::text)::timestamp) AT TIME ZONE v_tz;

  IF v_break_start IS NOT NULL AND v_break_end IS NOT NULL THEN
    v_break_start_ts := ((p_date::text || ' ' || v_break_start::text)::timestamp) AT TIME ZONE v_tz;
    v_break_end_ts := ((p_date::text || ' ' || v_break_end::text)::timestamp) AT TIME ZONE v_tz;
  END IF;

  v_cursor := v_day_start;
  WHILE v_cursor + make_interval(mins => v_duration) <= v_day_end LOOP
    v_slot_end := v_cursor + make_interval(mins => v_duration);

    IF v_cursor > now()
      AND (
        v_break_start_ts IS NULL
        OR NOT (tstzrange(v_cursor, v_slot_end) && tstzrange(v_break_start_ts, v_break_end_ts))
      )
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.establishment_id = p_establishment_id
          AND a.status <> 'cancelled'
          AND (
            (p_professional_id IS NOT NULL AND a.professional_id = p_professional_id)
            OR (p_professional_id IS NULL AND a.professional_id IS NULL)
          )
          AND tstzrange(a.starts_at, a.ends_at) && tstzrange(v_cursor, v_slot_end)
      ) AND NOT EXISTS (
        SELECT 1 FROM public.time_blocks b
        WHERE b.establishment_id = p_establishment_id
          AND (b.professional_id IS NULL OR b.professional_id = p_professional_id)
          AND tstzrange(b.starts_at, b.ends_at) && tstzrange(v_cursor, v_slot_end)
      ) THEN
        RETURN NEXT v_cursor;
      END IF;
    END IF;

    v_cursor := v_cursor + make_interval(mins => v_step);
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.available_slots(uuid, uuid, uuid, date, uuid[]) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text);

CREATE FUNCTION public.book_appointment(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_service_ids uuid[] DEFAULT NULL
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

  INSERT INTO public.customers (establishment_id, name, phone, email)
  VALUES (p_establishment_id, v_name, v_phone, v_email)
  ON CONFLICT (establishment_id, phone)
  DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, public.customers.email)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.appointments (
    establishment_id, service_id, professional_id, customer_id, starts_at, ends_at,
    status, notes, service_names, total_price_cents
  )
  VALUES (
    p_establishment_id, p_service_id, p_professional_id, v_customer_id, p_starts_at, v_ends_at,
    'pending', nullif(btrim(coalesce(p_notes,'')),''), v_service_names, v_total_price_cents
  )
  RETURNING id INTO v_appointment_id;

  INSERT INTO public.notification_queue (establishment_id, appointment_id, channel, event, payload)
  VALUES
    (p_establishment_id, v_appointment_id, 'whatsapp', 'appointment_created', jsonb_build_object('phone', v_phone, 'name', v_name, 'starts_at', p_starts_at)),
    (p_establishment_id, v_appointment_id, 'email', 'appointment_created', jsonb_build_object('email', v_email, 'name', v_name, 'starts_at', p_starts_at));

  RETURN jsonb_build_object('appointment_id', v_appointment_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at);
END; $$;

GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text, uuid[]) TO anon, authenticated;
