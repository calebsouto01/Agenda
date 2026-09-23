-- Evita leads duplicados no Funil: o gatilho passa a atualizar o lead
-- existente do cliente (por establishment_id + customer_id) em vez de
-- inserir um novo a cada agendamento.
CREATE OR REPLACE FUNCTION public.create_funnel_lead_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_phone text;
  v_origem text := 'Agendamento';
  v_label text;
  v_existing_id uuid;
BEGIN
  SELECT name, phone INTO v_name, v_phone FROM public.customers WHERE id = NEW.customer_id;
  IF v_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.marketing_link_id IS NOT NULL THEN
    SELECT label INTO v_label FROM public.marketing_links WHERE id = NEW.marketing_link_id;
    IF v_label IS NOT NULL THEN
      v_origem := 'Marketing: ' || v_label;
    END IF;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.crm_leads
  WHERE establishment_id = NEW.establishment_id AND customer_id = NEW.customer_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Cliente já tem lead no funil: reaponta pro novo agendamento e reinicia
    -- o ciclo de lembrete, sem tocar em stage (não retrocede progresso) nem
    -- em origem (preserva o canal de aquisição original).
    UPDATE public.crm_leads SET
      appointment_id = NEW.id,
      name = v_name,
      phone = v_phone,
      whatsapp_msg1_sent_at = NULL,
      whatsapp_confirmacao_sent_at = NULL
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.crm_leads (establishment_id, customer_id, appointment_id, name, phone, origem, stage)
    VALUES (NEW.establishment_id, NEW.customer_id, NEW.id, v_name, v_phone, v_origem, 'mensagem_1');
  END IF;

  RETURN NEW;
END;
$function$;

-- Limpeza dos leads duplicados já existentes: mantém o lead mais antigo por
-- (establishment_id, customer_id), reaponta pro agendamento mais recente e
-- remove os demais.
DO $$
DECLARE
  r record;
  v_keep_id uuid;
  v_latest_appointment_id uuid;
BEGIN
  FOR r IN
    SELECT establishment_id, customer_id
    FROM public.crm_leads
    GROUP BY establishment_id, customer_id
    HAVING count(*) > 1
  LOOP
    SELECT id INTO v_keep_id
    FROM public.crm_leads
    WHERE establishment_id = r.establishment_id AND customer_id = r.customer_id
    ORDER BY created_at ASC
    LIMIT 1;

    SELECT appointment_id INTO v_latest_appointment_id
    FROM public.crm_leads
    WHERE establishment_id = r.establishment_id AND customer_id = r.customer_id
    ORDER BY created_at DESC
    LIMIT 1;

    UPDATE public.crm_leads
    SET appointment_id = v_latest_appointment_id
    WHERE id = v_keep_id;

    DELETE FROM public.crm_leads
    WHERE establishment_id = r.establishment_id
      AND customer_id = r.customer_id
      AND id <> v_keep_id;
  END LOOP;
END $$;
