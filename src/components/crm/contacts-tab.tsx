import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Smartphone, UserPlus } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadCard, ORIGENS, type Lead } from "./lead-shared";

const EMPTY_FORM = { name: "", phone: "", origem: "" };

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
  const [search, setSearch] = useState("");

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["customers", establishmentId, "contatos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(
          "id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda, next_contact_at, appointments!appointments_customer_id_fkey(status, starts_at)",
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
      });
      if (error) {
        throw new Error(
          error.code === "23505" ? "Este telefone já está cadastrado" : error.message,
        );
      }
    },
    onSuccess: () => {
      toast.success("Contato criado");
      setForm({ ...EMPTY_FORM });
      setOpenNew(false);
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
        count > 0 ? `${count} novo(s) contato(s) importado(s)` : "Nenhum contato novo encontrado",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredLeads = leads.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
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

      <div className="sticky top-14 z-10 bg-background py-2 md:top-0">
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

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <UserPlus className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Nenhum contato cadastrado</p>
              <p className="text-sm text-muted-foreground">
                Importe do celular ou cadastre um contato pra começar.
              </p>
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
            <LeadCard key={lead.id} lead={lead} responsavelNome={null}>
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
            </LeadCard>
          ))}
        </div>
      )}
    </div>
  );
}
