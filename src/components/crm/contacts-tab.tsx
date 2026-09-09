import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus, Smartphone, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { normalizePhone } from "@/lib/booking";
import { isNativeApp, pickAllDeviceContacts } from "@/lib/native-contacts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const EMPTY_FORM = { name: "", phone: "", origem: "", valor: "", responsavelId: "" };

export function ContactsTab({ establishmentId }: { establishmentId: string }) {
  const queryClient = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [leadPerdido, setLeadPerdido] = useState<Lead | null>(null);
  const [motivo, setMotivo] = useState("");

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["crm-leads", establishmentId, "novo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select(
          "id, customer_id, name, phone, origem, stage, valor_estimado_cents, responsavel_id, notes, motivo_perda",
        )
        .eq("establishment_id", establishmentId)
        .eq("stage", "novo")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

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
    queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
  }

  const createContact = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (name.length < 2) throw new Error("Informe o nome");
      const cents = form.valor ? Math.round(Number(form.valor.replace(",", ".")) * 100) : null;
      const { error } = await supabase.from("crm_leads").insert({
        establishment_id: establishmentId,
        name,
        phone: form.phone.trim() || null,
        origem: form.origem.trim() || "Outro",
        valor_estimado_cents: cents,
        responsavel_id: form.responsavelId || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Contato criado");
      setForm({ ...EMPTY_FORM });
      setOpenNew(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: async (lead: Lead) => {
      const { error } = await supabase
        .from("crm_leads")
        .update({ stage: "contato" })
        .eq("id", lead.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Contato ativado no pipeline");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markLost = useMutation({
    mutationFn: async () => {
      if (!leadPerdido) return;
      if (!motivo.trim()) throw new Error("Informe o motivo");
      const { error } = await supabase
        .from("crm_leads")
        .update({ stage: "perdido", motivo_perda: motivo.trim() })
        .eq("id", leadPerdido.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Contato descartado");
      setLeadPerdido(null);
      setMotivo("");
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

      const [{ data: existingCustomers }, { data: existingLeads }] = await Promise.all([
        supabase.from("customers").select("phone").eq("establishment_id", establishmentId),
        supabase.from("crm_leads").select("phone").eq("establishment_id", establishmentId),
      ]);
      const known = new Set(
        [...(existingCustomers ?? []), ...(existingLeads ?? [])]
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

      const { error } = await supabase.from("crm_leads").insert(
        newContacts.map((c) => ({
          establishment_id: establishmentId,
          name: c.name,
          phone: c.phone,
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

  const responsavelNome = (id: string | null) =>
    professionals?.find((p) => p.id === id)?.name ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Contatos ainda não trabalhados. Ative os que valem a pena abordar.
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
              <span className="truncate">
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
                <Label htmlFor="contact-valor">Valor estimado (R$)</Label>
                <Input
                  id="contact-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
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

      {leadPerdido ? (
        <Card className="border-destructive/30 shadow-soft">
          <CardContent className="grid gap-3 p-5">
            <p className="text-sm font-semibold">Descartar "{leadPerdido.name}"</p>
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
                disabled={markLost.isPending}
                onClick={() => markLost.mutate()}
              >
                Descartar contato
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setLeadPerdido(null);
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
      ) : (contacts?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <UserPlus className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Nenhum contato pendente</p>
              <p className="text-sm text-muted-foreground">
                Importe do celular ou cadastre um contato pra começar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {contacts?.map((contact) => (
            <LeadCard
              key={contact.id}
              lead={contact}
              responsavelNome={responsavelNome(contact.responsavel_id)}
            >
              <div className="flex flex-col gap-2 min-[420px]:flex-row">
                <button
                  type="button"
                  onClick={() => activate.mutate(contact)}
                  className="flex items-center justify-center gap-1 rounded-md bg-foreground px-2 py-1.5 text-xs font-medium text-background hover:opacity-90 min-[420px]:flex-1"
                >
                  Ativar no pipeline <ArrowRight className="size-3 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLeadPerdido(contact);
                    setMotivo("");
                  }}
                  className="shrink-0 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  Descartar
                </button>
              </div>
            </LeadCard>
          ))}
        </div>
      )}
    </div>
  );
}
