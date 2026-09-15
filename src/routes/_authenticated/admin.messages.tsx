import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import {
  DEFAULT_MESSAGE_1,
  DEFAULT_MESSAGE_ATENCAO,
  DEFAULT_MESSAGE_CONFIRMACAO,
  DEFAULT_MESSAGE_REENGAJAMENTO,
  MESSAGE_PLACEHOLDERS,
} from "@/lib/message-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const { data: establishment, isLoading } = useEstablishment();
  const queryClient = useQueryClient();
  const [messagesForm, setMessagesForm] = useState({
    message1: "",
    confirmacao: "",
    atencao: "",
    reengajamento: "",
  });

  useEffect(() => {
    if (!establishment) return;
    setMessagesForm({
      message1: establishment.whatsapp_message_1 ?? DEFAULT_MESSAGE_1,
      confirmacao: establishment.whatsapp_message_confirmacao ?? DEFAULT_MESSAGE_CONFIRMACAO,
      atencao: establishment.whatsapp_message_atencao ?? DEFAULT_MESSAGE_ATENCAO,
      reengajamento: establishment.whatsapp_message_reengajamento ?? DEFAULT_MESSAGE_REENGAJAMENTO,
    });
  }, [establishment]);

  const saveMessages = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("establishments")
        .update({
          whatsapp_message_1: messagesForm.message1.trim() || null,
          whatsapp_message_confirmacao: messagesForm.confirmacao.trim() || null,
          whatsapp_message_atencao: messagesForm.atencao.trim() || null,
          whatsapp_message_reengajamento: messagesForm.reengajamento.trim() || null,
        })
        .eq("id", establishment!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Mensagens salvas");
      queryClient.invalidateQueries({ queryKey: ["my-establishment"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !establishment) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PageTitle icon={MessageSquareText}>Mensagens de WhatsApp</PageTitle>
      <Card className="shadow-soft">
        <CardContent className="grid gap-4 p-5">
          <p className="text-xs text-muted-foreground">
            Variáveis disponíveis: {MESSAGE_PLACEHOLDERS.join(" · ")}
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="msg-1">Mensagem 1 (após o agendamento)</Label>
            <Textarea
              id="msg-1"
              maxLength={500}
              rows={3}
              value={messagesForm.message1}
              onChange={(e) => setMessagesForm({ ...messagesForm, message1: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="msg-confirmacao">Confirmação do dia</Label>
            <Textarea
              id="msg-confirmacao"
              maxLength={500}
              rows={3}
              value={messagesForm.confirmacao}
              onChange={(e) => setMessagesForm({ ...messagesForm, confirmacao: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="msg-atencao">Atenção (cliente sem visitar há 30+ dias)</Label>
            <Textarea
              id="msg-atencao"
              maxLength={500}
              rows={3}
              value={messagesForm.atencao}
              onChange={(e) => setMessagesForm({ ...messagesForm, atencao: e.target.value })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="msg-reengajamento">Reengajamento (cliente inativo há 60+ dias)</Label>
            <Textarea
              id="msg-reengajamento"
              maxLength={500}
              rows={3}
              value={messagesForm.reengajamento}
              onChange={(e) => setMessagesForm({ ...messagesForm, reengajamento: e.target.value })}
            />
          </div>
          <Button disabled={saveMessages.isPending} onClick={() => saveMessages.mutate()}>
            {saveMessages.isPending ? "Salvando..." : "Salvar mensagens"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
