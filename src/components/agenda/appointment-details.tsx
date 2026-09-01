import { useState } from "react";
import { Phone, Trash2 } from "lucide-react";

import {
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  formatPrice,
  timeInZone,
  type AppointmentStatus,
  type PaymentMethod,
} from "@/lib/booking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Row } from "./types";

export function AppointmentInfo({ appointment: a, tz }: { appointment: Row; tz: string }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold">{timeInZone(a.starts_at, tz)}</span>
        <StatusBadge status={a.status} />
        <PaymentBadge paid={a.paid} method={a.payment_method} />
      </div>
      <p className="text-sm font-semibold">{a.customers?.name}</p>
      <p className="text-xs text-muted-foreground">
        {a.services?.name}
        {a.professionals ? ` · ${a.professionals.name}` : ""}
        {a.services ? ` · ${formatPrice(a.services.price_cents)}` : ""}
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

export function AppointmentActions({
  appointment: a,
  onUpdateStatus,
  onDelete,
}: {
  appointment: Row;
  onUpdateStatus: (id: string, status: AppointmentStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {a.status !== "confirmed" && a.status !== "completed" ? (
        <Button size="sm" onClick={() => onUpdateStatus(a.id, "confirmed")}>
          Confirmar
        </Button>
      ) : null}
      {a.status !== "completed" && a.status !== "cancelled" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!a.paid}
          title={!a.paid ? "Marque o pagamento antes de concluir" : undefined}
          onClick={() => onUpdateStatus(a.id, "completed")}
        >
          Concluir
        </Button>
      ) : null}
      {a.status !== "cancelled" ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => onUpdateStatus(a.id, "cancelled")}
        >
          Cancelar
        </Button>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="text-destructive">
            <Trash2 className="size-4" />
            Excluir
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o agendamento de {a.customers?.name} permanentemente e não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete(a.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function PendingConfirmation({
  appointment: a,
  onUpdateStatus,
}: {
  appointment: Row;
  onUpdateStatus: (id: string, status: AppointmentStatus) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
        Este agendamento está aguardando confirmação.
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onUpdateStatus(a.id, "confirmed")}>
          Confirmar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => onUpdateStatus(a.id, "cancelled")}
        >
          Cancelar
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

function PaymentBadge({ paid, method }: { paid: boolean; method: PaymentMethod | null }) {
  if (!paid) {
    return (
      <Badge variant="outline" className="border-0 bg-muted text-muted-foreground">
        Pendente
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-0 bg-success/20 text-success">
      Pago{method ? ` · ${PAYMENT_METHOD_LABEL[method]}` : ""}
    </Badge>
  );
}

export function PaymentActions({
  appointment: a,
  onUpdatePayment,
}: {
  appointment: Row;
  onUpdatePayment: (id: string, method: PaymentMethod | null, note: string | null) => void;
}) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");

  if (a.paid) {
    return (
      <div className="space-y-1">
        {a.payment_method === "outro" && a.payment_note ? (
          <p className="text-xs text-muted-foreground">Obs: {a.payment_note}</p>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => onUpdatePayment(a.id, null, null)}
        >
          Desfazer pagamento
        </Button>
      </div>
    );
  }

  const methods: PaymentMethod[] = ["dinheiro", "cartao", "pix"];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Marcar como pago:</span>
        {methods.map((m) => (
          <Button
            key={m}
            size="sm"
            variant="outline"
            onClick={() => onUpdatePayment(a.id, m, null)}
          >
            {PAYMENT_METHOD_LABEL[m]}
          </Button>
        ))}
        <Button
          size="sm"
          variant={showNoteInput ? "secondary" : "outline"}
          onClick={() => setShowNoteInput((v) => !v)}
        >
          Outro
        </Button>
      </div>
      {showNoteInput ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Descreva a forma de pagamento"
            maxLength={200}
            className="h-8 max-w-xs text-xs"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            size="sm"
            disabled={note.trim().length === 0}
            onClick={() => onUpdatePayment(a.id, "outro", note.trim())}
          >
            Confirmar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
