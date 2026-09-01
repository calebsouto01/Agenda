import { useEffect, useState } from "react";
import { Phone, X } from "lucide-react";

import {
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  formatPrice,
  serviceLabel,
  timeInZone,
  totalPriceCents,
  type AppointmentStatus,
  type PaymentMethod,
} from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Row } from "./types";

export function AppointmentInfo({ appointment: a, tz }: { appointment: Row; tz: string }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold">{timeInZone(a.starts_at, tz)}</span>
        <StatusBadge status={a.status} />
        {a.status !== "pending" ? <PaymentBadge paid={a.paid} entries={a.payment_entries} /> : null}
      </div>
      <p className="text-sm font-semibold">{a.customers?.name}</p>
      <p className="text-xs text-muted-foreground">
        {serviceLabel(a)}
        {a.professionals ? ` · ${a.professionals.name}` : ""}
        {` · ${formatPrice(totalPriceCents(a))}`}
      </p>
      {a.customers?.phone ? (
        <a
          href={`https://wa.me/${a.customers.phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
        >
          <Phone className="size-3" />
          {a.customers.phone}
        </a>
      ) : null}
      {a.notes ? <p className="mt-1 text-xs italic text-muted-foreground">{a.notes}</p> : null}
    </div>
  );
}

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30];

export function PendingConfirmation({
  appointment: a,
  onRefuse,
  onConfirm,
}: {
  appointment: Row;
  onRefuse: (id: string) => void;
  onConfirm: (appointment: Row, intervalMinutes: number) => void;
}) {
  const serviceCount = a.service_names ? a.service_names.split(" + ").length : 1;
  const [askInterval, setAskInterval] = useState(false);

  if (askInterval) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Este agendamento tem {serviceCount} serviços ({a.service_names}). Deseja inserir um
          intervalo entre eles?
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onConfirm(a, 0)}>
            Sem intervalo
          </Button>
          {INTERVAL_OPTIONS.map((minutes) => (
            <Button key={minutes} size="sm" variant="outline" onClick={() => onConfirm(a, minutes)}>
              {minutes} min
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
        Este agendamento está aguardando aceite.
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => (serviceCount > 1 ? setAskInterval(true) : onConfirm(a, 0))}
        >
          Aceitar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => onRefuse(a.id)}
        >
          Recusar
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  const styles: Record<AppointmentStatus, string> = {
    pending: "bg-warning/20 text-warning-foreground",
    confirmed: "bg-primary/15 text-primary",
    completed: "bg-success/20 text-success",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return (
    <Badge variant="outline" className={`border-0 ${styles[status]}`}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function PaymentBadge({ paid, entries }: { paid: boolean; entries: Row["payment_entries"] }) {
  if (!paid) {
    return (
      <Badge variant="outline" className="border-0 bg-muted text-muted-foreground">
        Pendente
      </Badge>
    );
  }
  const label =
    entries.length > 1 ? "dividido" : entries[0] ? PAYMENT_METHOD_LABEL[entries[0].method] : "";
  return (
    <Badge variant="outline" className="border-0 bg-success/20 text-success">
      Pago{label ? ` · ${label}` : ""}
    </Badge>
  );
}

const PAYMENT_METHODS: PaymentMethod[] = ["dinheiro", "cartao", "pix", "outro"];

export function PaymentActions({
  appointment: a,
  onAddPayment,
  onRemovePayment,
}: {
  appointment: Row;
  onAddPayment: (
    appointmentId: string,
    method: PaymentMethod,
    amountCents: number,
    note: string | null,
  ) => void;
  onRemovePayment: (entryId: string) => void;
}) {
  const totalCents = totalPriceCents(a);
  const paidCents = a.payment_entries.reduce((sum, e) => sum + e.amount_cents, 0);
  const remainingCents = Math.max(0, totalCents - paidCents);

  const [method, setMethod] = useState<PaymentMethod>("dinheiro");
  const [amount, setAmount] = useState(remainingCents > 0 ? (remainingCents / 100).toFixed(2) : "");
  const [note, setNote] = useState("");

  useEffect(() => {
    setAmount(remainingCents > 0 ? (remainingCents / 100).toFixed(2) : "");
    setNote("");
  }, [remainingCents]);

  const amountCents = Math.round(Number(amount.replace(",", ".")) * 100) || 0;
  const canAdd = amountCents > 0 && (method !== "outro" || note.trim().length > 0);

  return (
    <div className="space-y-3">
      {a.payment_entries.length > 0 ? (
        <div className="space-y-1.5">
          {a.payment_entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate">
                <span className="font-semibold">{PAYMENT_METHOD_LABEL[entry.method]}</span>
                {entry.note ? <span className="text-muted-foreground"> · {entry.note}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-semibold">{formatPrice(entry.amount_cents)}</span>
                <button
                  type="button"
                  onClick={() => onRemovePayment(entry.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-muted-foreground">
              Pago {formatPrice(paidCents)} de {formatPrice(totalCents)}
            </span>
            {remainingCents === 0 ? (
              <span className="text-success">Quitado</span>
            ) : (
              <span className="text-warning-foreground">Falta {formatPrice(remainingCents)}</span>
            )}
          </div>
        </div>
      ) : null}

      {remainingCents > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              className="h-8 flex-1 text-xs"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {method === "outro" ? (
            <Input
              placeholder="Descreva a forma de pagamento"
              maxLength={200}
              className="h-8 text-xs"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          ) : null}
          <Button
            size="sm"
            className="w-full"
            disabled={!canAdd}
            onClick={() =>
              onAddPayment(a.id, method, amountCents, method === "outro" ? note.trim() : null)
            }
          >
            Adicionar pagamento
          </Button>
        </div>
      ) : null}
    </div>
  );
}
