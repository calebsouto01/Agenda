import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { NotebookPen, Phone, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/hooks/use-establishment";
import type { AppointmentStatus } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_ATENCAO,
  DEFAULT_MESSAGE_REENGAJAMENTO,
  fillTemplate,
} from "@/lib/message-templates";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactsTab } from "@/components/crm/contacts-tab";
import { PipelineTab } from "@/components/crm/pipeline-tab";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
  appointments: { status: AppointmentStatus; starts_at: string }[];
};

type View = "list" | "rank";
/** Funil = pipeline de vendas (tela padrão). Diretório = todo mundo cadastrado (leads + clientes). */
type Section = "funil" | "diretorio";
type DirView = "leads" | "clientes";
/** Recência da última visita concluída — de "30dias" em diante sugere reengajar, "60dias" recuperar. */
type Recency = "recentes" | "30dias" | "60dias";
type RecencyFilter = Recency | "todos";

const DAY_MS = 24 * 60 * 60 * 1000;

const RECENCY_LABEL: Record<Recency, string> = {
  recentes: "Recentes",
  "30dias": "30 dias",
  "60dias": "60 dias",
};

const RECENCY_BADGE: Record<Recency, string> = {
  recentes: "bg-success/20 text-success",
  "30dias": "bg-warning/20 text-warning-foreground",
  "60dias": "bg-muted text-muted-foreground",
};

function recencyOf(daysSinceLastVisit: number | null): Recency {
  if (daysSinceLastVisit == null) return "recentes";
  if (daysSinceLastVisit >= 60) return "60dias";
  if (daysSinceLastVisit >= 30) return "30dias";
  return "recentes";
}

function CustomersPage() {
  const { data: establishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("funil");
  const [dirView, setDirView] = useState<DirView>("leads");
  const [term, setTerm] = useState("");
  const [view, setView] = useState<View>("list");
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>("todos");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", establishment?.id],
    enabled: Boolean(establishment?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, email, notes, created_at, appointments(status, starts_at)")
        .eq("establishment_id", establishment!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
  });

  const saveNotes = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("customers")
        .update({ notes: noteDraft.trim() || null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Notas salvas");
      setEditingNotesId(null);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withCounts = useMemo(
    () =>
      (customers ?? []).map((c) => {
        const completed = c.appointments.filter((a) => a.status === "completed");
        const visits = completed.length;
        const lastVisitAt = completed.length
          ? completed.reduce(
              (max, a) => (a.starts_at > max ? a.starts_at : max),
              completed[0]!.starts_at,
            )
          : null;
        const daysSinceLastVisit = lastVisitAt
          ? (Date.now() - new Date(lastVisitAt).getTime()) / DAY_MS
          : null;
        return {
          ...c,
          total: c.appointments.length,
          visits,
          daysSinceLastVisit,
          recency: recencyOf(daysSinceLastVisit),
        };
      }),
    [customers],
  );

  // Cliente = concluiu pelo menos um serviço. Leads que nunca chegaram a um
  // atendimento concluído ficam no Funil/Diretório → Leads, não aqui.
  const searched = withCounts.filter((c) => {
    const matchesTerm = `${c.name} ${c.phone} ${c.email ?? ""}`
      .toLowerCase()
      .includes(term.trim().toLowerCase());
    return c.visits > 0 && matchesTerm;
  });

  const recencyCounts: Record<Recency, number> = {
    recentes: searched.filter((c) => c.recency === "recentes").length,
    "30dias": searched.filter((c) => c.recency === "30dias").length,
    "60dias": searched.filter((c) => c.recency === "60dias").length,
  };

  const filtered =
    recencyFilter === "todos" ? searched : searched.filter((c) => c.recency === recencyFilter);

  const ranked = useMemo(
    () => [...filtered].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)),
    [filtered],
  );

  function reengagementMessage(recency: Recency, name: string) {
    const template =
      recency === "60dias"
        ? (establishment?.whatsapp_message_reengajamento ?? DEFAULT_MESSAGE_REENGAJAMENTO)
        : (establishment?.whatsapp_message_atencao ?? DEFAULT_MESSAGE_ATENCAO);
    return fillTemplate(template, {
      nome: name.split(" ")[0] || name,
      data: "",
      hora: "",
      estabelecimento: establishment?.name ?? "",
    });
  }

  return (
    <div className="space-y-4">
      <PageTitle icon={Users}>Clientes</PageTitle>

      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
        <TabsList>
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="diretorio">Diretório</TabsTrigger>
        </TabsList>

        <TabsContent value="funil" className="pt-4">
          {establishment ? (
            <PipelineTab
              establishmentId={establishment.id}
              establishmentName={establishment.name}
              timezone={establishment.timezone}
              message1Template={establishment.whatsapp_message_1}
              messageConfirmacaoTemplate={establishment.whatsapp_message_confirmacao}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="diretorio" className="space-y-4 pt-4">
          <Tabs value={dirView} onValueChange={(v) => setDirView(v as DirView)}>
            <TabsList>
              <TabsTrigger value="leads">Leads</TabsTrigger>
              <TabsTrigger value="clientes">Clientes</TabsTrigger>
            </TabsList>
          </Tabs>

          {dirView === "leads" ? (
            establishment ? (
              <ContactsTab establishmentId={establishment.id} />
            ) : null
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Tabs
                  value={recencyFilter}
                  onValueChange={(v) => setRecencyFilter(v as RecencyFilter)}
                >
                  <TabsList>
                    <TabsTrigger value="recentes">Recentes ({recencyCounts.recentes})</TabsTrigger>
                    <TabsTrigger value="30dias">30 dias ({recencyCounts["30dias"]})</TabsTrigger>
                    <TabsTrigger value="60dias">60 dias ({recencyCounts["60dias"]})</TabsTrigger>
                    <TabsTrigger value="todos">Todos</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs value={view} onValueChange={(v) => setView(v as View)}>
                  <TabsList>
                    <TabsTrigger value="list">Lista</TabsTrigger>
                    <TabsTrigger value="rank">Rank</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <Input
                placeholder="Buscar por nome, telefone ou e-mail"
                maxLength={80}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />

              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : filtered.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum cliente encontrado.
                  </CardContent>
                </Card>
              ) : view === "list" ? (
                <div className="grid grid-cols-1 gap-2">
                  {filtered.map((c) => (
                    <Card key={c.id}>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                                {c.name}
                              </p>
                              <Badge
                                variant="outline"
                                className={`border-0 ${RECENCY_BADGE[c.recency]}`}
                              >
                                {RECENCY_LABEL[c.recency]}
                              </Badge>
                            </div>
                            <WhatsAppLink
                              phone={c.phone}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                            >
                              <Phone className="size-3" />
                              {c.phone}
                            </WhatsAppLink>
                            {c.email ? (
                              <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                            ) : null}
                            {c.notes && editingNotesId !== c.id ? (
                              <p className="mt-1 truncate text-xs italic text-muted-foreground">
                                {c.notes}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {c.total} agendamento(s)
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingNotesId(editingNotesId === c.id ? null : c.id);
                                setNoteDraft(c.notes ?? "");
                              }}
                            >
                              <NotebookPen className="size-4" />
                            </Button>
                          </div>
                        </div>
                        {editingNotesId === c.id ? (
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Observações sobre este cliente"
                              maxLength={500}
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={saveNotes.isPending}
                                onClick={() => saveNotes.mutate(c.id)}
                              >
                                Salvar notas
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingNotesId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {c.recency === "30dias" || c.recency === "60dias" ? (
                          <WhatsAppLink
                            phone={c.phone}
                            message={reengagementMessage(c.recency, c.name)}
                            className="flex w-full items-center justify-center gap-1 rounded-md border border-primary/30 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                          >
                            <Send className="size-3 shrink-0" />
                            {c.recency === "60dias" ? "Reengajar" : "Sugerir retorno"}
                          </WhatsAppLink>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {ranked.map((c, i) => (
                    <Card key={c.id}>
                      <CardContent className="flex items-center gap-3 p-4">
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                            i === 0
                              ? "bg-warning/20 text-warning-foreground"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {c.name}
                            </p>
                            <Badge
                              variant="outline"
                              className={`border-0 ${RECENCY_BADGE[c.recency]}`}
                            >
                              {RECENCY_LABEL[c.recency]}
                            </Badge>
                          </div>
                          <WhatsAppLink
                            phone={c.phone}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                          >
                            <Phone className="size-3" />
                            {c.phone}
                          </WhatsAppLink>
                        </div>
                        <span className="shrink-0 text-sm font-bold">
                          {c.visits} visita{c.visits === 1 ? "" : "s"}
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
