import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, ChevronLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Zaka" },
      { name: "description", content: "Política de privacidade da plataforma Zaka." },
    ],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <main className="min-h-screen surface-hero">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link to="/" className="flex items-center gap-2 text-base font-bold">
          <CalendarCheck className="size-5 text-primary" />
          Zaka
        </Link>
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" />
          Voltar
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-20">
        <Card className="shadow-soft">
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div>
              <h1 className="text-2xl font-extrabold">Política de Privacidade</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Última atualização: setembro de 2026
              </p>
            </div>

            <div className="space-y-5 text-sm leading-relaxed text-foreground/90">
              <section>
                <h2 className="mb-1 text-sm font-bold">1. Quem somos</h2>
                <p>
                  A Zaka (CNPJ 67.596.409/0001-93) é responsável pelo tratamento dos dados pessoais
                  coletados através desta plataforma de agendamento online, em conformidade com a
                  Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">2. Quais dados coletamos</h2>
                <p>Coletamos os seguintes dados, conforme o uso da Plataforma:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <strong>Dados do estabelecimento:</strong> nome, e-mail, telefone, endereço,
                    serviços, profissionais e horários de funcionamento cadastrados por quem
                    administra o negócio.
                  </li>
                  <li>
                    <strong>Dados de clientes finais:</strong> nome, telefone e e-mail informados ao
                    realizar um agendamento, além do histórico de agendamentos e pagamentos
                    registrados pelo estabelecimento.
                  </li>
                  <li>
                    <strong>Contatos do celular (somente no aplicativo Android):</strong> quando o
                    administrador do estabelecimento usa o aplicativo instalado (não o site) e toca
                    em "Importar contatos do celular", solicitamos permissão do sistema Android para
                    ler a lista de contatos do aparelho. Essa leitura só acontece com autorização
                    explícita do usuário a cada uso, e os contatos importados (nome e telefone) são
                    salvos apenas na conta daquele estabelecimento, como parte do CRM interno, para
                    ajudar a organizar quem contatar. Não lemos, armazenamos ou compartilhamos
                    nenhum outro dado do celular além de nome e telefone dos contatos selecionados
                    para importação.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">3. Como usamos os dados</h2>
                <p>
                  Usamos os dados coletados exclusivamente para operar a Plataforma: autenticar
                  contas, exibir a agenda de cada estabelecimento, processar agendamentos, gerar
                  relatórios financeiros e de clientes para o próprio estabelecimento, e permitir o
                  funcionamento do CRM (pipeline de leads e atividades). Não usamos esses dados para
                  publicidade nem os vendemos a terceiros.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">4. Compartilhamento de dados</h2>
                <p>
                  Os dados são armazenados em infraestrutura de banco de dados fornecida por um
                  provedor terceirizado (Supabase), que atua apenas como operador técnico dos dados,
                  sob as mesmas obrigações de confidencialidade e segurança. Não compartilhamos
                  dados com outros terceiros, exceto quando exigido por lei ou ordem judicial.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">5. Armazenamento e segurança</h2>
                <p>
                  Os dados de cada estabelecimento ficam isolados por conta, com controle de acesso
                  que impede que um estabelecimento veja os dados de outro. Utilizamos conexões
                  criptografadas (HTTPS) em toda a Plataforma.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">6. Seus direitos</h2>
                <p>Conforme a LGPD, você pode solicitar a qualquer momento:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Confirmação de que tratamos seus dados e acesso a eles;</li>
                  <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                  <li>
                    Exclusão de dados pessoais (leads, contatos importados ou clientes podem ser
                    excluídos diretamente pelo estabelecimento dentro do próprio painel);
                  </li>
                  <li>Informações sobre com quem compartilhamos seus dados.</li>
                </ul>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">7. Retenção de dados</h2>
                <p>
                  Mantemos os dados enquanto a conta do estabelecimento estiver ativa, ou pelo tempo
                  necessário para cumprir obrigações legais. Dados podem ser excluídos a pedido do
                  estabelecimento ou do titular dos dados, respeitadas eventuais obrigações legais
                  de retenção.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">8. Alterações nesta política</h2>
                <p>
                  Podemos atualizar esta Política periodicamente. Alterações relevantes serão
                  comunicadas nesta página, com a data de atualização revisada.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">9. Contato</h2>
                <p>
                  Para exercer seus direitos ou tirar dúvidas sobre esta Política, entre em contato
                  pelos canais informados na página inicial da Plataforma.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">CNPJ 67.596.409/0001-93</p>
              </section>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
