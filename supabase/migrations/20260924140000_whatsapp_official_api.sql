-- Troca o gateway por QR code (Evolution) pela API oficial da Meta (WhatsApp
-- Cloud API) com Embedded Signup. O token de cada cliente fica em tabela
-- separada, sem nenhuma policy: só service_role (Edge Functions) lê.
ALTER TABLE public.whatsapp_agents
  DROP COLUMN instance_name,
  ADD COLUMN waba_id text,
  ADD COLUMN phone_number_id text UNIQUE,
  ADD COLUMN verified_name text;

CREATE TABLE public.whatsapp_credentials (
  agent_id uuid PRIMARY KEY REFERENCES public.whatsapp_agents ON DELETE CASCADE,
  access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_credentials FROM anon, authenticated;
GRANT ALL ON public.whatsapp_credentials TO service_role;

-- A Meta reenvia webhooks em caso de lentidão; o id da mensagem evita responder duas vezes.
ALTER TABLE public.whatsapp_messages ADD COLUMN wa_message_id text UNIQUE;
