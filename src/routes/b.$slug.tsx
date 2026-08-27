import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CalendarCheck, CheckCircle2, MapPin, Phone } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WEEKDAYS_SHORT,
  addDays,
  dateTimeInZone,
  formatDateLabel,
  formatDuration,
  formatPrice,
  isoDateInZone,
  timeInZone,
  weekdayOf,
} from "@/lib/booking";

export const Route = createFileRoute("/b/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("establishments")
      .select("name, description")
      .eq("slug", params.slug)
      .maybeSingle();
    return { name: data?.name ?? null, description: data?.description ?? null };
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.name ?? params.slug;
    const title = `Agendar online — ${name}`;
    const description =
      loaderData?.description ??
      "Escolha o serviço, o profissional e um horário disponível para confirmar seu agendamento.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: PublicBooking,
});


const customerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(120, "Nome muito longo"),
  phone: z
    .string()
    .trim()
    .min(8, "Informe um telefone válido")
    .max(30, "Telefone muito longo")
    .refine((v) => v.replace(/\D/g, "").length >= 8, "Informe um telefone válido"),
  email: z.union([z.string().trim().email("E-mail inválido").max(200), z.literal("")]),
  notes: z.string().trim().max(400, "Observação muito longa"),
});

function PublicBooking() {
  const { slug } = Route.useParams();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [confirmed, setConfirmed] = useState<{ starts_at: string } | null>(null);

  const { data: shop, isLoading } = useQuery({
    queryKey: ["shop", slug],
    queryFn: async () => {
      const { data: establishment, error } = await supabase
        .from("establishments")
        .select("id, name, slug, description, phone, address, timezone")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!establishment) return null;

      const [services, professionals, hours] = await Promise.all([
        supabase
          .from("services")
          .select("id, name, description, price_cents, duration_minutes")
          .eq("establishment_id", establishment.id)
          .eq("active", true)
          .order("name"),
        supabase
          .from("professionals")
          .select("id, name, role")
          .eq("establishment_id", establishment.id)
          .eq("active", true)
          .order("name"),
        supabase
          .from("business_hours")
          .select("weekday, opens_at, closes_at, closed")
          .eq("establishment_id", establishment.id),
      ]);
      if (services.error) throw services.error;
      if (professionals.error) throw professionals.error;
      if (hours.error) throw hours.error;

      return {
        establishment,
        services: services.data ?? [],
        professionals: professionals.data ?? [],
        hours: hours.data ?? [],
      };
    },
  });

  const tz = shop?.establishment.timezone ?? "America/Sao_Paulo";
  const dates = useMemo(() => {
    const today = isoDateInZone(new Date(), tz);
    return Array.from({ length: 21 }, (_, i) => addDays(today, i));
  }, [tz]);

  const openWeekdays = useMemo(
    () => new Set((shop?.hours ?? []).filter((h) => !h.closed).map((h) => h.weekday)),
    [shop],
  );

  const { data: slots, isFetching: loadingSlots } = useQuery({
    queryKey: ["slots", shop?.establishment.id, serviceId, professionalId, date],
    enabled: Boolean(shop?.establishment.id && serviceId && date),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("available_slots", {
        p_establishment_id: shop!.establishment.id,
        p_service_id: serviceId!,
        p_professional_id: professionalId,
        p_date: date!,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as string[];
    },
  });

  const booking = useMutation({
    mutationFn: async () => {
      const parsed = customerSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]!.message);
      const { data, error } = await supabase.rpc("book_appointment", {
        p_establishment_id: shop!.establishment.id,
        p_service_id: serviceId!,
        p_professional_id: professionalId,
        p_starts_at: slot!,
        p_customer_name: parsed.data.name,
        p_customer_phone: parsed.data.phone,
        p_customer_email: parsed.data.email || null,
        p_notes: parsed.data.notes || null,
      } as never);
      if (error) throw new Error(error.message);
      return data as unknown as { starts_at: string };
    },
    onSuccess: (data) => setConfirmed(data),
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">Estabelecimento não encontrado</h1>
        <Button asChild variant="outline">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </main>
    );
  }

  const service = shop.services.find((s) => s.id === serviceId) ?? null;
  const professional = shop.professionals.find((p) => p.id === professionalId) ?? null;

  if (confirmed) {
    return (
      <main className="flex min-h-screen items-center justify-center surface-hero p-4">
        <Card className="w-full max-w-md shadow-soft">
          <CardContent className="space-y-4 p-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <h1 className="text-xl font-bold">Agendamento confirmado!</h1>
            <div className="rounded-xl border bg-muted/40 p-4 text-left text-sm">
              <p className="font-semibold">{shop.establishment.name}</p>
              <p className="text-muted-foreground">{service?.name}</p>
              {professional ? (
                <p className="text-muted-foreground">com {professional.name}</p>
              ) : null}
              <p className="mt-2 font-semibold">{dateTimeInZone(confirmed.starts_at, tz)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Guarde este horário. Em caso de imprevisto, entre em contato com o estabelecimento
              {shop.establishment.phone ? ` no ${shop.establishment.phone}` : ""}.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setConfirmed(null);
                setSlot(null);
                setServiceId(null);
                setProfessionalId(null);
                setDate(null);
                setForm({ name: "", phone: "", email: "", notes: "" });
              }}
            >
              Fazer outro agendamento
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen surface-hero pb-16">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" /> Todos os estabelecimentos
        </Link>

        <Card className="shadow-soft">
          <CardContent className="space-y-1 p-5">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <CalendarCheck className="size-4" /> Agendamento online
            </span>
            <h1 className="text-2xl font-extrabold">{shop.establishment.name}</h1>
            {shop.establishment.description ? (
              <p className="text-sm text-muted-foreground">{shop.establishment.description}</p>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
              {shop.establishment.address ? (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {shop.establishment.address}
                </span>
              ) : null}
              {shop.establishment.phone ? (
                <span className="flex items-center gap-1">
                  <Phone className="size-3.5" />
                  {shop.establishment.phone}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* 1. Serviço */}
        <Step number={1} title="Escolha o serviço">
          {shop.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum serviço disponível no momento.</p>
          ) : (
            <div className="grid gap-2">
              {shop.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setServiceId(s.id);
                    setSlot(null);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                    serviceId === s.id ? "border-primary bg-accent" : "bg-card hover:bg-muted/60"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-semibold">{s.name}</span>
                    {s.description ? (
                      <span className="block text-xs text-muted-foreground">{s.description}</span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {formatDuration(s.duration_minutes)}
                    </span>
                  </span>
                  <span className="text-sm font-bold">{formatPrice(s.price_cents)}</span>
                </button>
              ))}
            </div>
          )}
        </Step>

        {/* 2. Profissional */}
        {serviceId && shop.professionals.length > 0 ? (
          <Step number={2} title="Escolha o profissional">
            <div className="grid grid-cols-2 gap-2">
              <SelectChip
                active={professionalId === null}
                onClick={() => {
                  setProfessionalId(null);
                  setSlot(null);
                }}
                label="Sem preferência"
              />
              {shop.professionals.map((p) => (
                <SelectChip
                  key={p.id}
                  active={professionalId === p.id}
                  onClick={() => {
                    setProfessionalId(p.id);
                    setSlot(null);
                  }}
                  label={p.name}
                  hint={p.role ?? undefined}
                />
              ))}
            </div>
          </Step>
        ) : null}

        {/* 3. Data */}
        {serviceId ? (
          <Step number={shop.professionals.length > 0 ? 3 : 2} title="Escolha a data">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dates.map((d) => {
                const wd = weekdayOf(d);
                const disabled = !openWeekdays.has(wd);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setDate(d);
                      setSlot(null);
                    }}
                    className={`flex min-w-16 flex-col items-center rounded-xl border px-3 py-2 text-xs transition-colors ${
                      date === d ? "border-primary bg-accent" : "bg-card hover:bg-muted/60"
                    } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <span className="text-muted-foreground">{WEEKDAYS_SHORT[wd]}</span>
                    <span className="text-base font-bold">{d.slice(8)}</span>
                  </button>
                );
              })}
            </div>
          </Step>
        ) : null}

        {/* 4. Horário */}
        {serviceId && date ? (
          <Step
            number={shop.professionals.length > 0 ? 4 : 3}
            title={`Horários livres em ${formatDateLabel(date)}`}
          >
            {loadingSlots ? (
              <Skeleton className="h-10 w-full" />
            ) : slots && slots.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={`rounded-lg border py-2 text-sm font-semibold transition-colors ${
                      slot === s ? "border-primary bg-accent" : "bg-card hover:bg-muted/60"
                    }`}
                  >
                    {timeInZone(s, tz)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum horário livre nesta data. Tente outro dia.
              </p>
            )}
          </Step>
        ) : null}

        {/* 5. Dados */}
        {slot ? (
          <Step
            number={shop.professionals.length > 0 ? 5 : 4}
            title="Seus dados"
            subtitle={`${service?.name} · ${dateTimeInZone(slot, tz)}${
              professional ? ` · ${professional.name}` : ""
            }`}
          >
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                booking.mutate();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <Input
                  id="phone"
                  required
                  inputMode="tel"
                  maxLength={30}
                  placeholder="(11) 99999-9999"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="email">E-mail (opcional)</Label>
                <Input
                  id="email"
                  type="email"
                  maxLength={200}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea
                  id="notes"
                  maxLength={400}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <Button type="submit" size="lg" disabled={booking.isPending}>
                {booking.isPending ? "Confirmando..." : "Confirmar agendamento"}
              </Button>
            </form>
          </Step>
        ) : null}
      </div>
    </main>
  );
}

function Step({
  number,
  title,
  subtitle,
  children,
}: {
  number: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-4 shadow-soft">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {number}
          </span>
          <div>
            <h2 className="text-sm font-bold">{title}</h2>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function SelectChip({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left text-sm transition-colors ${
        active ? "border-primary bg-accent" : "bg-card hover:bg-muted/60"
      }`}
    >
      <span className="block font-semibold">{label}</span>
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </button>
  );
}
