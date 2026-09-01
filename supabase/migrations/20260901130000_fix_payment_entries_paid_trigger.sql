-- Fixes sync_appointment_paid_status: it was setting paid_at on any partial
-- payment (v_paid > 0), even when the appointment wasn't yet fully paid
-- (paid stays false), violating appointments_paid_consistency_check
-- ((paid = false AND paid_at IS NULL) OR (paid = true AND paid_at IS NOT NULL)).
-- paid_at must only be set together with paid = true.
CREATE OR REPLACE FUNCTION public.sync_appointment_paid_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appointment_id uuid := COALESCE(NEW.appointment_id, OLD.appointment_id);
  v_total int;
  v_paid int;
  v_is_paid boolean;
BEGIN
  SELECT COALESCE(a.total_price_cents, s.price_cents, 0) INTO v_total
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  WHERE a.id = v_appointment_id;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid
  FROM public.payment_entries WHERE appointment_id = v_appointment_id;

  v_is_paid := v_paid > 0 AND v_paid >= v_total;

  UPDATE public.appointments
  SET paid = v_is_paid,
      paid_at = CASE WHEN v_is_paid THEN now() ELSE NULL END
  WHERE id = v_appointment_id;

  RETURN NULL;
END; $$;
