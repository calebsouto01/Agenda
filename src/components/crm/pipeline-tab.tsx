import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, UserPlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Establishment } from "@/hooks/use-establishment";
import {
  DEFAULT_MESSAGE_ATENCAO,
  DEFAULT_MESSAGE_REENGAJAMENTO,
  fillTemplate,
} from "@/lib/message-templates";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadCard, type Lead } from "./lead-shared";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Funil de agendamento: só mostra quem precisa de alguma ação — cliente
 * novo pra receber boas-vindas, ou cliente parado há um tempo pra reativar.
 * Quem visitou recentemente não aparece aqui (isso é normal, não é lista). */
type Bucket = "novos" | "reativar30" | "reativar60";

const BUCKET_LABEL: Record<Bucket, string> = {
  novos: "Novos (30 dias)",
  reativar30: "Reativar · 30 dias",
  reativar60: "Reativar · 60 dias",
};

type PipelineRow = Lead & {
  created_at: string;
  appointments: { status: string; starts_at: string }[];
};

export function PipelineTab({ establishment }: { establishment: Establishment }) {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["customers", establishment.id, "pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda, next_contact_at, created_at, appointments!appointments_customer_id_fkey(status, starts_at)",
        )
        .eq("establishment_id", establishment.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PipelineRow[];
    },
  });

  const buckets = useMemo(() => {
    const result: Record<Bucket, PipelineRow[]> = { novos: [], reativar30: [], reativar60: [] };
    for (const row of rows ?? []) {
      const daysSinceCreated = (Date.now() - new Date(row.created_at).getTime()) / DAY_MS;
      if (daysSinceCreated <= 30) {
        result.novos.push(row);
        continue;
      }
      const completed = row.appointments.filter((a) => a.status === "completed");
      const lastVisitAt = completed.length
        ? completed.reduce(
            (max, a) => (a.starts_at > max ? a.starts_at : max),
            completed[0]!.starts_at,
          )
        : null;
      if (!lastVisitAt) continue;
      const daysSinceVisit = (Date.now() - new Date(lastVisitAt).getTime()) / DAY_MS;
      if (daysSinceVisit >= 60) result.reativar60.push(row);
      else if (daysSinceVisit >= 30) result.reativar30.push(row);
    }
    return result;
  }, [rows]);

  function reengagementMessage(bucket: "reativar30" | "reativar60", name: string) {
    const template =
      bucket === "reativar60"
        ? (establishment.whatsapp_message_reengajamento ?? DEFAULT_MESSAGE_REENGAJAMENTO)
        : (establishment.whatsapp_message_atencao ?? DEFAULT_MESSAGE_ATENCAO);
    return fillTemplate(template, {
      nome: name.split(" ")[0] || name,
      data: "",
      hora: "",
      estabelecimento: establishment.name,
    });
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const total = buckets.novos.length + buckets.reativar30.length + buckets.reativar60.length;

  if (total === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <UserPlus className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Nada pra ver aqui agora</p>
            <p className="text-sm text-muted-foreground">
              Quando chegar um cliente novo ou alguém sem visitar há um tempo, aparece aqui.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {(["novos", "reativar30", "reativar60"] as Bucket[]).map((bucket) => (
        <div key={bucket} className="flex w-64 shrink-0 flex-col gap-2">
          <div className="rounded-lg bg-muted px-2.5 py-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {BUCKET_LABEL[bucket]}
              </h2>
              <span className="text-xs font-medium text-muted-foreground">
                {buckets[bucket].length}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {buckets[bucket].map((lead) => (
              <LeadCard key={lead.id} lead={lead} responsavelNome={null} showSchedule>
                {bucket !== "novos" ? (
                  <WhatsAppLink
                    phone={lead.phone}
                    message={reengagementMessage(bucket, lead.name)}
                    className="flex w-full items-center justify-center gap-1 rounded-md border border-primary/30 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    <Send className="size-3 shrink-0" />
                    {bucket === "reativar60" ? "Reengajar" : "Sugerir retorno"}
                  </WhatsAppLink>
                ) : null}
              </LeadCard>
            ))}
            {buckets[bucket].length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">Nenhum aqui.</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
