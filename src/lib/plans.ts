import type { Plan } from "@/hooks/use-establishment";

export const PRO_PRICE_CENTS = 1990;

export const FREE_LIMITS = {
  maxProfessionals: 1,
  maxAppointmentsPerMonth: 50,
} as const;

export const PLAN_LABEL: Record<Plan, string> = {
  free: "Grátis",
  pro: "Pro",
  premium: "Premium",
};

/** Pro e Premium (Premium inclui tudo do Pro). */
export function isPro(plan: Plan) {
  return plan === "pro" || plan === "premium";
}

/** Agente de IA no WhatsApp. */
export function isPremium(plan: Plan) {
  return plan === "premium";
}

/**
 * Funil manual por wa.me (enviado pelo celular do dono): só no plano Grátis.
 * Pro e Premium usam avisos automáticos pela API oficial do WhatsApp.
 */
export function hasManualWhatsApp(plan: Plan) {
  return plan === "free";
}
