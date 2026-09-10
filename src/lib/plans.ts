import type { Plan } from "@/hooks/use-establishment";

export const PRO_PRICE_CENTS = 1990;

export const FREE_LIMITS = {
  maxProfessionals: 1,
  maxAppointmentsPerMonth: 50,
} as const;

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Grátis",
  pro: "Pro",
};

export function isPro(plan: Plan) {
  return plan === "pro";
}
