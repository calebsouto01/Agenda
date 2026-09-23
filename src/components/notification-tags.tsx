import { AlertTriangle, CheckCheck, Send } from "lucide-react";

/** Tarja do agendamento recém-aceito: falta enviar a mensagem 1 (pós-agendamento). */
export function ConfirmationTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
      <Send className="size-2.5" />
      Confirmação
    </span>
  );
}

/** Tarja do lembrete do dia: agendamento é hoje, falta confirmar com o cliente. */
export function TodayReminderTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
      <AlertTriangle className="size-2.5" />
      Lembrete do dia
    </span>
  );
}

/** Tarja do atendimento cujo horário já passou: falta finalizar (registrar pagamento). */
export function FinalizeTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
      <CheckCheck className="size-2.5" />
      Finalizar
    </span>
  );
}
