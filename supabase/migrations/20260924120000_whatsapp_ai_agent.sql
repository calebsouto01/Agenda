-- Agente de IA no WhatsApp: o dono lê um QR code (Evolution API), e um agente
-- (Claude) atende os clientes consultando serviços, horários livres e criando
-- agendamentos. Tabelas só acessadas pelo dono (RLS) e pelas Edge Functions
-- (service_role).

CREATE TABLE public.whatsapp_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL UNIQUE REFERENCES public.establishments ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  agent_name text NOT NULL DEFAULT 'Assistente',
  instructions text,
  instance_name text NOT NULL UNIQUE,
  connection_status text NOT NULL DEFAULT 'disconnected'
    CHECK (connection_status IN ('disconnected', 'connecting', 'connected')),
  connected_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments ON DELETE CASCADE,
  contact_phone text NOT NULL,
  contact_name text,
  ai_paused boolean NOT NULL DEFAULT false,
  needs_human boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, contact_phone)
);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.whatsapp_messages (conversation_id, created_at);

CREATE TRIGGER whatsapp_agents_touch BEFORE UPDATE ON public.whatsapp_agents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.whatsapp_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads agent" ON public.whatsapp_agents
  FOR SELECT TO authenticated USING (public.owns_establishment(establishment_id));
-- O dono só edita nome/instruções/ativo; criar/conectar passa pelas Edge Functions.
CREATE POLICY "owner updates agent" ON public.whatsapp_agents
  FOR UPDATE TO authenticated
  USING (public.owns_establishment(establishment_id))
  WITH CHECK (public.owns_establishment(establishment_id));

CREATE POLICY "owner manages conversations" ON public.whatsapp_conversations
  FOR ALL TO authenticated
  USING (public.owns_establishment(establishment_id))
  WITH CHECK (public.owns_establishment(establishment_id));

CREATE POLICY "owner reads messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = conversation_id AND public.owns_establishment(c.establishment_id)
    )
  );

GRANT SELECT, UPDATE ON public.whatsapp_agents TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_agents, public.whatsapp_conversations, public.whatsapp_messages TO service_role;

-- Atualização de estado de conexão só via service_role: impede o dono de forjar
-- "connected" ou trocar o instance_name pelo cliente.
REVOKE UPDATE ON public.whatsapp_agents FROM authenticated;
GRANT UPDATE (enabled, agent_name, instructions) ON public.whatsapp_agents TO authenticated;
