import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Plan = "free" | "pro" | "premium";
export type PlanStatus = "active" | "trialing" | "past_due" | "canceled";

export type Establishment = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  custom_domain: string | null;
  timezone: string;
  slot_step_minutes: number;
  plan: Plan;
  plan_status: PlanStatus;
  plan_renews_at: string | null;
  notify_pending_enabled: boolean;
  notify_finishable_enabled: boolean;
};

/** The establishment owned by the signed-in user (one per account in this version). */
export function useEstablishment() {
  return useQuery({
    queryKey: ["my-establishment"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("establishments")
        .select(
          "id, owner_id, name, slug, description, phone, address, custom_domain, timezone, slot_step_minutes, plan, plan_status, plan_renews_at, notify_pending_enabled, notify_finishable_enabled",
        )
        .eq("owner_id", auth.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Establishment | null) ?? null;
    },
  });
}
