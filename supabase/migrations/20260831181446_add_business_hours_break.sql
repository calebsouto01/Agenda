-- Optional lunch/rest break per weekday in business_hours, honored by the availability engine.
ALTER TABLE public.business_hours
  ADD COLUMN break_start time,
  ADD COLUMN break_end time,
  ADD CONSTRAINT business_hours_break_check CHECK (
    (break_start IS NULL AND break_end IS NULL)
    OR (break_start IS NOT NULL AND break_end IS NOT NULL AND break_end > break_start)
  );

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

  SELECT duration_minutes INTO v_duration
  FROM public.services
  WHERE id = p_service_id AND establishment_id = p_establishment_id AND active;
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

GRANT EXECUTE ON FUNCTION public.available_slots(uuid, uuid, uuid, date) TO anon, authenticated;
