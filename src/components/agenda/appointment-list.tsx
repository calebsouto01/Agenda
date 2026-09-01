import {
  dateTimeInZone,
  formatPrice,
  STATUS_LABEL,
  serviceLabel,
  totalPriceCents,
} from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
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
import { STATUS_CHIP, type Row } from "./types";

export function AppointmentList({
  appointments,
  tz,
  onSelect,
  onFinalize,
  onCancel,
  onDelete,
}: {
  appointments: Row[];
  tz: string;
  onSelect: (a: Row) => void;
  onFinalize: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
        Nenhum agendamento neste período.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {appointments.map((a) => (
        <Card key={a.id} className="shadow-soft">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <button type="button" onClick={() => onSelect(a)} className="min-w-0 flex-1 text-left">
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
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!a.paid}
                  title={!a.paid ? "Marque o pagamento antes de finalizar" : undefined}
                  onClick={() => onFinalize(a.id)}
                >
                  Finalizar
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
  );
}
