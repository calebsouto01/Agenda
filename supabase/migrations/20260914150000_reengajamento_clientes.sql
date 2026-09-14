-- Reengajamento: em vez de prospectar negócios de fora (Prospecção, removida),
-- ajuda o dono a recuperar/reter os próprios clientes. Duas mensagens de
-- WhatsApp editáveis, enviadas manualmente pelo próprio número do dono
-- (via wa.me, sem automação/custo de API) a partir do segmento do cliente
-- em Clientes → Diretório.
alter table public.establishments
  add column whatsapp_message_atencao text,
  add column whatsapp_message_reengajamento text;
