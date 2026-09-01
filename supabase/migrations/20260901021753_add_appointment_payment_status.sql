-- Payment status per appointment (paid/pending + method), decoupled from appointment_status:
-- a "completed" service was performed, "paid" tracks whether it was actually paid.
ALTER TABLE public.appointments
  ADD COLUMN paid boolean NOT NULL DEFAULT false,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN payment_method text,
  ADD CONSTRAINT appointments_payment_method_check CHECK (
    payment_method IS NULL OR payment_method IN ('dinheiro', 'cartao', 'pix')
  ),
  ADD CONSTRAINT appointments_paid_consistency_check CHECK (
    (paid = false AND paid_at IS NULL) OR (paid = true AND paid_at IS NOT NULL)
  );
