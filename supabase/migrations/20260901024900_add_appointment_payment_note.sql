-- "Outro" payment method with a mandatory note describing what it was
-- (e.g. fiado, transferência, permuta), for cases outside dinheiro/cartão/pix.
ALTER TABLE public.appointments
  ADD COLUMN payment_note text;

ALTER TABLE public.appointments
  DROP CONSTRAINT appointments_payment_method_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_method_check CHECK (
    payment_method IS NULL OR payment_method IN ('dinheiro', 'cartao', 'pix', 'outro')
  ),
  ADD CONSTRAINT appointments_payment_note_check CHECK (
    payment_method IS DISTINCT FROM 'outro' OR payment_note IS NOT NULL
  );
