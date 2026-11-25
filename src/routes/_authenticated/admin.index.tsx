import { createFileRoute, redirect } from "@tanstack/react-router";

// A primeira tela do app é Notificações: quem chega já vê as pendências do dia.
export const Route = createFileRoute("/_authenticated/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/notificacoes", replace: true });
  },
});
