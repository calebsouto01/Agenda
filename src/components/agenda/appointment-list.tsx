import {
  dateTimeInZone,
  formatPrice,
  STATUS_LABEL,
  serviceLabel,
  totalPriceCents,
} from "@/lib/booking";
import { Badge } from "@/components/ui/badge";
import { STATUS_CHIP, type Row } from "./types";

export function AppointmentList({
  appointments,
  tz,
  onSelect,
}: {
  appointments: Row[];
  tz: string;
  onSelect: (a: Row) => void;
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
        <button
          key={a.id}
          type="button"
          onClick={() => onSelect(a)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40"
        >
          <div className="min-w-0">
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
          </div>
        </button>
      ))}
    </div>
  );
}
