import { useState } from "react";
import { CalendarClock, Trash2 } from "lucide-react";

import {
  dateTimeInZone,
  formatPrice,
  isoDateInZone,
  STATUS_LABEL,
  serviceLabel,
  timeInZone,
  totalPriceCents,
  zonedDateTimeToIso,
  type PaymentMethod,
} from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { PaymentActions } from "./appointment-details";
import { STATUS_CHIP, type Row } from "./types";

export function AppointmentList({
  appointments,
  tz,
  onSelect,
  onFinalize,
  onCancel,
  onDelete,
  onReschedule,
  onAddPayment,
  onRemovePayment,
}: {
  appointments: Row[];
  tz: string;
  onSelect: (a: Row) => void;
  onFinalize: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onReschedule: (id: string, startsAt: string, endsAt: string) => void;
  onAddPayment: (
    appointmentId: string,
    method: PaymentMethod,
    amountCents: number,
    note: string | null,
  ) => void;
  onRemovePayment: (entryId: string) => void;
}) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const payingAppointment = appointments.find((a) => a.id === payingId) ?? null;
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const reschedulingAppointment = appointments.find((a) => a.id === reschedulingId) ?? null;
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  function openReschedule(a: Row) {
    setReschedulingId(a.id);
    setNewDate(isoDateInZone(new Date(a.starts_at), tz));
    setNewTime(timeInZone(a.starts_at, tz));
  }

  function confirmReschedule() {
    if (!reschedulingAppointment || !newDate || !newTime) return;
    const startsAt = zonedDateTimeToIso(newDate, newTime, tz);
    const durationMs =
      new Date(reschedulingAppointment.ends_at).getTime() -
      new Date(reschedulingAppointment.starts_at).getTime();
    const endsAt = new Date(new Date(startsAt).getTime() + durationMs).toISOString();
    onReschedule(reschedulingAppointment.id, startsAt, endsAt);
    setReschedulingId(null);
  }

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Nenhum agendamento neste período.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {appointments.map((a) => (
          <Card key={a.id} className="card-interactive rounded-2xl shadow-soft">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <button
                type="button"
                onClick={() => onSelect(a)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{dateTimeInZone(a.starts_at, tz)}</span>
                  <Badge variant="outline" className={`border-0 ${STATUS_CHIP[a.status]}`}>
                    {STATUS_LABEL[a.status]}
                  </Badge>
                </div>
                <p className="truncate text-sm font-semibold">{a.customers?.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {serviceLabel(a)}
                  {a.professionals ? ` · ${a.professionals.name}` : ""}
                  {` · ${formatPrice(totalPriceCents(a))}`}
                </p>
              </button>
              <div className="flex shrink-0 flex-wrap gap-2">
                {a.status !== "completed" && a.status !== "cancelled" ? (
                  <Button size="sm" variant="outline" onClick={() => setPayingId(a.id)}>
                    Finalizar
                  </Button>
                ) : null}
                {a.status === "completed" ? (
                  <Button size="sm" variant="outline" onClick={() => setPayingId(a.id)}>
                    Editar dados financeiros
                  </Button>
                ) : null}
                {a.status !== "completed" && a.status !== "cancelled" ? (
                  <Button size="sm" variant="outline" onClick={() => openReschedule(a)}>
                    <CalendarClock className="size-4" />
                    Reagendar
                  </Button>
                ) : null}
                {a.status !== "cancelled" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => onCancel(a.id)}
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
                        Esta ação remove o agendamento de {a.customers?.name} permanentemente e não
                        pode ser desfeita.
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
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(payingAppointment)} onOpenChange={(open) => !open && setPayingId(null)}>
        <DialogContent className="max-w-sm">
          {payingAppointment ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {payingAppointment.status === "completed" ? "Dados financeiros" : "Pagamento"}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {payingAppointment.customers?.name} · Valor total{" "}
                  <span className="font-semibold text-foreground">
                    {formatPrice(totalPriceCents(payingAppointment))}
                  </span>
                </p>
              </DialogHeader>
              <div className="space-y-3">
                <PaymentActions
                  appointment={payingAppointment}
                  onAddPayment={onAddPayment}
                  onRemovePayment={onRemovePayment}
                />
                {payingAppointment.status === "completed" ? (
                  <Button className="w-full" variant="outline" onClick={() => setPayingId(null)}>
                    Fechar
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    disabled={!payingAppointment.paid}
                    title={
                      !payingAppointment.paid ? "Marque o pagamento antes de finalizar" : undefined
                    }
                    onClick={() => {
                      onFinalize(payingAppointment.id);
                      setPayingId(null);
                    }}
                  >
                    Finalizar
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reschedulingAppointment)}
        onOpenChange={(open) => !open && setReschedulingId(null)}
      >
        <DialogContent className="max-w-sm">
          {reschedulingAppointment ? (
            <>
              <DialogHeader>
                <DialogTitle>Reagendar</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {reschedulingAppointment.customers?.name}
                </p>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="reschedule-date">Data</Label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    min={isoDateInZone(new Date(), tz)}
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="reschedule-time">Horário</Label>
                  <Input
                    id="reschedule-time"
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!newDate || !newTime}
                onClick={confirmReschedule}
              >
                Confirmar novo horário
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
