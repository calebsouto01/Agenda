import type { AppointmentStatus, PaymentMethod } from "@/lib/booking";

export type Range = "week" | "month";

export type PaymentEntry = {
  id: string;
  method: PaymentMethod;
  amount_cents: number;
  note: string | null;
};

export type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  notes: string | null;
  paid: boolean;
  service_id: string;
  professional_id: string | null;
  service_names: string | null;
  total_price_cents: number | null;
  services: { name: string; price_cents: number; duration_minutes: number } | null;
  professionals: { name: string } | null;
  customers: { id: string; name: string; phone: string; email: string | null } | null;
  payment_entries: PaymentEntry[];
};

export type BusinessHour = {
  weekday: number;
  opens_at: string;
  closes_at: string;
  closed: boolean;
  break_start: string | null;
  break_end: string | null;
};

export const STATUS_CHIP: Record<AppointmentStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  confirmed: "bg-primary/15 text-primary",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/10 text-destructive line-through",
};
