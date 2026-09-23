import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Send, Smartphone, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/booking";
import {
  DEFAULT_MESSAGE_ATENCAO,
  DEFAULT_MESSAGE_REENGAJAMENTO,
  fillTemplate,
} from "@/lib/message-templates";
import { isNativeApp, pickAllDeviceContacts } from "@/lib/native-contacts";
import type { Establishment } from "@/hooks/use-establishment";
import { WhatsAppLink } from "@/components/whatsapp-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadCard, ORIGENS, type Lead, type Professional } from "./lead-shared";

const EMPTY_FORM = { name: "", phone: "", origem: "", valorCents: 0, responsavelId: "" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Recência da última visita concluída — de "30dias" em diante sugere reengajar, "60dias" recuperar. */
type Recency = "30dias" | "60dias";

const RECENCY_LABEL: Record<Recency, string> = { "30dias": "30 dias", "60dias": "60 dias" };
const RECENCY_BADGE: Record<Recency, string> = {
  "30dias": "bg-warning/20 text-warning-foreground",
  "60dias": "bg-muted text-muted-foreground",
};

type ContactRow = Lead & { appointments: { status: string; starts_at: string }[] };

export function ContactsTab({
  establishmentId,
  establishment,
}: {
  establishmentId: string;
  establishment: Establishment;
}) {
  const queryClient = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [leadToHide, setLeadToHide] = useState<Lead | null>(null);
  const [motivo, setMotivo] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ativos" | "perdidos">("ativos");

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["customers", establishmentId, "contatos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda, next_contact_at, appointments(status, starts_at)",
        )
        .eq("establishment_id", establishmentId)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ContactRow[];
    },
  });

  const leads = useMemo(
    () =>
      (contacts ?? []).map((c) => {
        const completed = c.appointments.filter((a) => a.status === "completed");
        const lastVisitAt = completed.length
          ? completed.reduce(
              (max, a) => (a.starts_at > max ? a.starts_at : max),
              completed[0]!.starts_at,
            )
          : null;
        const daysSinceLastVisit = lastVisitAt
          ? (Date.now() - new Date(lastVisitAt).getTime()) / DAY_MS
          : null;
        const recency: Recency | null =
          daysSinceLastVisit == null
            ? null
            : daysSinceLastVisit >= 60
              ? "60dias"
              : daysSinceLastVisit >= 30
                ? "30dias"
                : null;
        return { ...c, visits: completed.length, recency };
      }),
    [contacts],
  );

  function reengagementMessage(recency: Recency, name: string) {
    const template =
      recency === "60dias"
        ? (establishment.whatsapp_message_reengajamento ?? DEFAULT_MESSAGE_REENGAJAMENTO)
        : (establishment.whatsapp_message_atencao ?? DEFAULT_MESSAGE_ATENCAO);
    return fillTemplate(template, {
      nome: name.split(" ")[0] || name,
      data: "",
      hora: "",
      estabelecimento: establishment.name,
    });
  }

  const { data: professionals } = useQuery({
    queryKey: ["professionals-select", establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Professional[];
    },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  }

  const createContact = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (name.length < 2) throw new Error("Informe o nome");
      const phone = normalizePhone(form.phone);
      if (phone.length < 8) throw new Error("Informe um telefone válido");
      const { error } = await supabase.from("customers").insert({
        establishment_id: establishmentId,
        name,
        phone,
        origem: form.origem.trim() || "Outro",
        valor_estimado_cents: form.valorCents > 0 ? form.valorCents : null,
        responsavel_id: form.responsavelId || null,
      });
      if (error) {
        throw new Error(
          error.code === "23505" ? "Este telefone já está cadastrado" : error.message,
        );
      }
    },
    onSuccess: () => {
      toast.success("Contato criado e já está no Funil");
      setForm({ ...EMPTY_FORM });
      setOpenNew(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hideContact = useMutation({
    mutationFn: async () => {
      if (!leadToHide) return;
      if (!motivo.trim()) throw new Error("Informe o motivo");
      const { error } = await supabase
        .from("customers")
        .update({ stage: "perdido", motivo_perda: motivo.trim() })
        .eq("id", leadToHide.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Marcado como perdido");
      setLeadToHide(null);
      setMotivo("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivate = useMutation({
    mutationFn: async (lead: Lead) => {
      const { error } = await supabase
        .from("customers")
        .update({ stage: "novo", motivo_perda: null })
        .eq("id", lead.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Contato reativado no Funil");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importContacts = useMutation({
    mutationFn: async () => {
      const deviceContacts = await pickAllDeviceContacts();
      if (deviceContacts.length === 0) {
        throw new Error("Nenhum contato com telefone encontrado no celular");
      }

      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("phone")
        .eq("establishment_id", establishmentId);
      const known = new Set(
        (existingCustomers ?? [])
          .map((r) => (r.phone ? normalizePhone(r.phone) : null))
          .filter((v): v is string => Boolean(v)),
      );

      const seen = new Set<string>();
      const newContacts = deviceContacts.filter((c) => {
        const key = normalizePhone(c.phone);
        if (key.length < 8 || known.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (newContacts.length === 0) return 0;

      const { error } = await supabase.from("customers").insert(
        newContacts.map((c) => ({
          establishment_id: establishmentId,
          name: c.name,
          phone: normalizePhone(c.phone),
          origem: "Contatos importados",
        })),
      );
      if (error) throw new Error(error.message);
      return newContacts.length;
    },
    onSuccess: (count) => {
      toast.success(
        count > 0
          ? `${count} novo(s) contato(s) importado(s) pro Funil`
          : "Nenhum contato novo encontrado",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const responsavelNome = (id: string | null) =>
    professionals?.find((p) => p.id === id)?.name ?? null;

  const activeLeads = leads.filter((l) => l.stage !== "perdido");
  const lostLeads = leads.filter((l) => l.stage === "perdido");
  const baseList = filter === "ativos" ? activeLeads : lostLeads;
  const filteredLeads = baseList.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Todos os seus contatos, de leads a clientes. Cadastre ou importe pra alimentar o Funil.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {isNativeApp() ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              disabled={importContacts.isPending}
              onClick={() => importContacts.mutate()}
            >
              <Smartphone className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {importContacts.isPending ? "Importando..." : "Importar contatos do celular"}
              </span>
            </Button>
          ) : null}
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setOpenNew(true);
            }}
          >
            <Plus className="size-4 shrink-0" /> Novo contato
          </Button>
        </div>
      </div>

      <div className="sticky top-14 z-10 space-y-2 bg-background py-2 md:top-0">
        <div className="inline-flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setFilter("ativos")}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              filter === "ativos"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ativos ({activeLeads.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("perdidos")}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              filter === "perdidos"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Perdidos ({lostLeads.length})
          </button>
        </div>
        <Input
          placeholder="Buscar por nome ou telefone"
          maxLength={80}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {openNew ? (
        <Card className="shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <div className="grid gap-1.5">
              <Label htmlFor="contact-name">Nome</Label>
              <Input
                id="contact-name"
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="contact-phone">Telefone</Label>
                <Input
                  id="contact-phone"
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="contact-valor">Valor estimado</Label>
                <CurrencyInput
                  id="contact-valor"
                  valueCents={form.valorCents}
                  onValueChange={(cents) => setForm({ ...form, valorCents: cents })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="contact-origem">Origem</Label>
                <Input
                  id="contact-origem"
                  list="contact-origens"
                  maxLength={60}
                  value={form.origem}
                  onChange={(e) => setForm({ ...form, origem: e.target.value })}
                />
                <datalist id="contact-origens">
                  {ORIGENS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
              <div className="grid gap-1.5">
                <Label>Responsável</Label>
                <Select
                  value={form.responsavelId}
                  onValueChange={(v) => setForm({ ...form, responsavelId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={createContact.isPending} onClick={() => createContact.mutate()}>
                Criar contato
              </Button>
              <Button variant="ghost" onClick={() => setOpenNew(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {leadToHide ? (
        <Card className="border-destructive/30 shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <p className="text-sm font-semibold">Marcar "{leadToHide.name}" como perdido</p>
            <div className="grid gap-1.5">
              <Label htmlFor="contact-motivo">Motivo</Label>
              <Input
                id="contact-motivo"
                maxLength={200}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={hideContact.isPending}
                onClick={() => hideContact.mutate()}
              >
                Marcar como perdido
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setLeadToHide(null);
                  setMotivo("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : baseList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <UserPlus className="size-5" />
            </div>
            <div>
              {filter === "ativos" ? (
                <>
                  <p className="text-sm font-medium">Nenhum contato cadastrado</p>
                  <p className="text-sm text-muted-foreground">
                    Importe do celular ou cadastre um contato pra começar.
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium">Nenhum contato perdido</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum contato encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              responsavelNome={responsavelNome(lead.responsavel_id)}
              showStage
            >
              {lead.visits > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {lead.visits} atendimento{lead.visits === 1 ? "" : "s"} concluído
                  {lead.visits === 1 ? "" : "s"}
                  {lead.recency ? (
                    <Badge
                      variant="outline"
                      className={`ml-1.5 border-0 text-[10px] ${RECENCY_BADGE[lead.recency]}`}
                    >
                      {RECENCY_LABEL[lead.recency]} sem voltar
                    </Badge>
                  ) : null}
                </p>
              ) : null}
              {filter === "perdidos" ? (
                <div className="space-y-1.5">
                  {lead.motivo_perda ? (
                    <p className="truncate text-xs text-muted-foreground">{lead.motivo_perda}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => reactivate.mutate(lead)}
                    className="flex w-full items-center justify-center gap-1 rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:opacity-90"
                  >
                    <RotateCcw className="size-3 shrink-0" /> Reativar
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {lead.recency ? (
                    <WhatsAppLink
                      phone={lead.phone}
                      message={reengagementMessage(lead.recency, lead.name)}
                      className="flex w-full items-center justify-center gap-1 rounded-md border border-primary/30 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <Send className="size-3 shrink-0" />
                      {lead.recency === "60dias" ? "Reengajar" : "Sugerir retorno"}
                    </WhatsAppLink>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setLeadToHide(lead);
                      setMotivo("");
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    Marcar perdido
                  </button>
                </div>
              )}
            </LeadCard>
          ))}
        </div>
      )}
    </div>
  );
}
