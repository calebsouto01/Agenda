-- Lets a single appointment's payment be split across more than one method
-- (e.g. part in cash, part by card). Replaces the single payment_method /
-- payment_note columns on appointments with one row per payment made.
CREATE TABLE public.payment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('dinheiro', 'cartao', 'pix', 'outro')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_entries_note_check CHECK (method IS DISTINCT FROM 'outro' OR note IS NOT NULL)
);
CREATE INDEX ON public.payment_entries (appointment_id);
CREATE INDEX ON public.payment_entries (establishment_id, created_at);

ALTER TABLE public.payment_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages payment_entries" ON public.payment_entries FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id)) WITH CHECK (public.owns_establishment(establishment_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_entries TO authenticated;
GRANT ALL ON public.payment_entries TO service_role;

-- Keeps appointments.paid / paid_at in sync with the sum of its payment_entries,
-- so existing UI that reads a single "paid" flag keeps working. Only counts as
-- fully paid once the entries cover the appointment's total price.
CREATE OR REPLACE FUNCTION public.sync_appointment_paid_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_appointment_id uuid := COALESCE(NEW.appointment_id, OLD.appointment_id);
  v_total int;
  v_paid int;
BEGIN
  SELECT COALESCE(a.total_price_cents, s.price_cents, 0) INTO v_total
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  WHERE a.id = v_appointment_id;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid
  FROM public.payment_entries WHERE appointment_id = v_appointment_id;

  UPDATE public.appointments
  SET paid = (v_paid > 0 AND v_paid >= v_total),
      paid_at = CASE WHEN v_paid > 0 THEN now() ELSE NULL END
  WHERE id = v_appointment_id;

  RETURN NULL;
END; $$;

CREATE TRIGGER payment_entries_sync_paid
AFTER INSERT OR UPDATE OR DELETE ON public.payment_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_paid_status();

-- Backfill: turn each already-paid appointment's single method into one entry.
INSERT INTO public.payment_entries (establishment_id, appointment_id, method, amount_cents, note, created_at)
SELECT
  a.establishment_id,
  a.id,
  a.payment_method,
  COALESCE(a.total_price_cents, s.price_cents, 0),
  a.payment_note,
  COALESCE(a.paid_at, a.updated_at)
FROM public.appointments a
JOIN public.services s ON s.id = a.service_id
WHERE a.paid
  AND a.payment_method IS NOT NULL
  AND COALESCE(a.total_price_cents, s.price_cents, 0) > 0;

ALTER TABLE public.appointments
  DROP COLUMN payment_method,
  DROP COLUMN payment_note;
