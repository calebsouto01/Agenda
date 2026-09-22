import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

// Link curto de marketing (/l/{code}): registra o clique no banco e manda o
// visitante pra página de agendamento certa, carregando o código como ?ref=
// pra o agendamento final voltar atribuído a esse link.
export const Route = createFileRoute("/l/$code")({
  ssr: false,
  loader: async ({ params }) => {
    const { data, error } = await supabase.rpc("resolve_marketing_link", {
      p_code: params.code,
    } as never);
    const result = (error ? null : data) as unknown as
      { found: true; slug: string; code: string } | { found: false } | null;

    if (result?.found) {
      throw redirect({
        to: "/b/$slug",
        params: { slug: result.slug },
        search: { ref: result.code },
      });
    }
    throw redirect({ to: "/" });
  },
  component: () => null,
});
