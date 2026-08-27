CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE public.appointment_status AS ENUM ('pending','confirmed','completed','cancelled');

CREATE TABLE public.establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  phone text,
  address text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  accent text,
  slot_step_minutes int NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_cents int NOT NULL DEFAULT 0,
  duration_minutes int NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.services (establishment_id);

CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.professionals (establishment_id);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, phone)
);

CREATE TABLE public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time NOT NULL DEFAULT '09:00',
  closes_at time NOT NULL DEFAULT '18:00',
  closed boolean NOT NULL DEFAULT false,
  UNIQUE (establishment_id, weekday)
);

CREATE TABLE public.time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX ON public.time_blocks (establishment_id, starts_at);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services ON DELETE RESTRICT,
  professional_id uuid REFERENCES public.professionals ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.customers ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX ON public.appointments (establishment_id, starts_at);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlap_professional
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled' AND professional_id IS NOT NULL);

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlap_establishment
  EXCLUDE USING gist (
    establishment_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled' AND professional_id IS NULL);

CREATE TABLE public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.notification_queue (status, created_at);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER establishments_touch BEFORE UPDATE ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER appointments_touch BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ownership helper
CREATE OR REPLACE FUNCTION public.owns_establishment(_establishment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.establishments e
    WHERE e.id = _establishment_id AND e.owner_id = auth.uid()
  );
$$;

-- GRANTS
GRANT SELECT ON public.establishments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishments TO authenticated;
GRANT ALL ON public.establishments TO service_role;

GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;

GRANT SELECT ON public.professionals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;

GRANT SELECT ON public.business_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hours TO authenticated;
GRANT ALL ON public.business_hours TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_blocks TO authenticated;
GRANT ALL ON public.time_blocks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;

-- RLS
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view establishments" ON public.establishments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "owner inserts own establishment" ON public.establishments FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner updates own establishment" ON public.establishments FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "owner deletes own establishment" ON public.establishments FOR DELETE TO authenticated USING (owner_id = auth.uid());

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view active services" ON public.services FOR SELECT TO anon USING (active);
CREATE POLICY "owner manages services" ON public.services FOR ALL TO authenticated USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view active professionals" ON public.professionals FOR SELECT TO anon USING (active);
CREATE POLICY "owner manages professionals" ON public.professionals FOR ALL TO authenticated USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can view business hours" ON public.business_hours FOR SELECT TO anon USING (true);
CREATE POLICY "owner manages business hours" ON public.business_hours FOR ALL TO authenticated USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages customers" ON public.customers FOR ALL TO authenticated USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

ALTER TABLE public.time_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages time blocks" ON public.time_blocks FOR ALL TO authenticated USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages appointments" ON public.appointments FOR ALL TO authenticated USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner views notifications" ON public.notification_queue FOR SELECT TO authenticated USING (public.owns_establishment(establishment_id));

-- Availability engine
CREATE OR REPLACE FUNCTION public.available_slots(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_date date
) RETURNS SETOF timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tz text;
  v_step int;
  v_duration int;
  v_open time;
  v_close time;
  v_closed boolean;
  v_weekday int;
  v_cursor timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_slot_end timestamptz;
BEGIN
  SELECT timezone, slot_step_minutes INTO v_tz, v_step
  FROM public.establishments WHERE id = p_establishment_id;
  IF v_tz IS NULL THEN RETURN; END IF;

  SELECT duration_minutes INTO v_duration
  FROM public.services
  WHERE id = p_service_id AND establishment_id = p_establishment_id AND active;
  IF v_duration IS NULL THEN RETURN; END IF;

  v_weekday := EXTRACT(DOW FROM p_date)::int;
  SELECT opens_at, closes_at, closed INTO v_open, v_close, v_closed
  FROM public.business_hours
  WHERE establishment_id = p_establishment_id AND weekday = v_weekday;
  IF v_open IS NULL OR v_closed THEN RETURN; END IF;

  v_day_start := ((p_date::text || ' ' || v_open::text)::timestamp) AT TIME ZONE v_tz;
  v_day_end := ((p_date::text || ' ' || v_close::text)::timestamp) AT TIME ZONE v_tz;

  v_cursor := v_day_start;
  WHILE v_cursor + make_interval(mins => v_duration) <= v_day_end LOOP
    v_slot_end := v_cursor + make_interval(mins => v_duration);

    IF v_cursor > now() THEN
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

GRANT EXECUTE ON FUNCTION public.available_slots(uuid, uuid, uuid, date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_establishment_id uuid,
  p_service_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duration int;
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

  SELECT duration_minutes INTO v_duration FROM public.services
  WHERE id = p_service_id AND establishment_id = p_establishment_id AND active;
  IF v_duration IS NULL THEN RAISE EXCEPTION 'Serviço indisponível'; END IF;

  IF p_professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = p_professional_id AND establishment_id = p_establishment_id AND active
  ) THEN RAISE EXCEPTION 'Profissional indisponível'; END IF;

  v_ends_at := p_starts_at + make_interval(mins => v_duration);

  IF NOT EXISTS (
    SELECT 1 FROM public.available_slots(p_establishment_id, p_service_id, p_professional_id, (p_starts_at AT TIME ZONE (SELECT timezone FROM public.establishments WHERE id = p_establishment_id))::date) s
    WHERE s = p_starts_at
  ) THEN
    RAISE EXCEPTION 'Este horário não está mais disponível';
  END IF;

  INSERT INTO public.customers (establishment_id, name, phone, email)
  VALUES (p_establishment_id, v_name, v_phone, v_email)
  ON CONFLICT (establishment_id, phone)
  DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, public.customers.email)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.appointments (establishment_id, service_id, professional_id, customer_id, starts_at, ends_at, status, notes)
  VALUES (p_establishment_id, p_service_id, p_professional_id, v_customer_id, p_starts_at, v_ends_at, 'pending', nullif(btrim(coalesce(p_notes,'')),''))
  RETURNING id INTO v_appointment_id;

  INSERT INTO public.notification_queue (establishment_id, appointment_id, channel, event, payload)
  VALUES
    (p_establishment_id, v_appointment_id, 'whatsapp', 'appointment_created', jsonb_build_object('phone', v_phone, 'name', v_name, 'starts_at', p_starts_at)),
    (p_establishment_id, v_appointment_id, 'email', 'appointment_created', jsonb_build_object('email', v_email, 'name', v_name, 'starts_at', p_starts_at));

  RETURN jsonb_build_object('appointment_id', v_appointment_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at);
END; $$;

GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text) TO anon, authenticated;