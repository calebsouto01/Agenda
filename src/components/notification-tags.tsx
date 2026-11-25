import { CheckCheck } from "lucide-react";

/** Tarja do atendimento cujo horário já passou: falta finalizar (registrar pagamento). */
export function FinalizeTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
      <CheckCheck className="size-2.5" />
      Finalizar
    </span>
  );
}
