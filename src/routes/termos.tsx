import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, ChevronLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Zaka" },
      { name: "description", content: "Termos de uso da plataforma Zaka." },
    ],
  }),
  component: TermosPage,
});

function TermosPage() {
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
              <h1 className="text-2xl font-extrabold">Termos de Uso</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Última atualização: novembro de 2026
              </p>
            </div>

            <div className="space-y-5 text-sm leading-relaxed text-foreground/90">
              <section>
                <h2 className="mb-1 text-sm font-bold">1. Aceitação dos termos</h2>
                <p>
                  Ao criar uma conta, cadastrar um estabelecimento ou realizar um agendamento pela
                  Zaka ("Plataforma"), você concorda com estes Termos de Uso e com a nossa{" "}
                  <Link to="/privacidade" className="font-semibold text-primary underline">
                    Política de Privacidade
                  </Link>
                  . Se não concordar, não utilize a Plataforma.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">2. Descrição do serviço</h2>
                <p>
                  A Zaka é uma plataforma de agendamento online que permite a estabelecimentos de
                  serviços (salões, barbearias, clínicas, oficinas e similares) gerenciar serviços,
                  profissionais, horários, clientes e agendamentos, e permite que clientes finais
                  marquem horários diretamente com esses estabelecimentos.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">3. Cadastro e responsabilidades</h2>
                <p>
                  O estabelecimento é responsável por manter seus dados cadastrais, serviços,
                  preços, horários de funcionamento e informações de clientes atualizados e
                  corretos. A Zaka não participa das relações comerciais entre o estabelecimento e
                  seus clientes, e não se responsabiliza pela qualidade, execução ou cumprimento dos
                  serviços agendados.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">4. Agendamentos e cancelamentos</h2>
                <p>
                  Horários, políticas de cancelamento, cobrança e reembolso são definidos livremente
                  por cada estabelecimento. O agendamento feito pelo cliente fica pendente até o
                  estabelecimento aceitá-lo ou recusá-lo. A Zaka apenas disponibiliza a ferramenta
                  técnica para registrar e organizar esses agendamentos.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">5. Planos e automação por WhatsApp</h2>
                <p>A Plataforma é oferecida em três planos:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <strong>Grátis:</strong> agenda, clientes, serviços, profissionais e página
                    pública de agendamento;
                  </li>
                  <li>
                    <strong>Pro:</strong> inclui a automação por WhatsApp: aviso quando o
                    agendamento é aceito e lembrete no dia com opção de confirmar ou cancelar;
                  </li>
                  <li>
                    <strong>Premium:</strong> inclui tudo do Pro e o agente de inteligência
                    artificial que atende e agenda pelo WhatsApp.
                  </li>
                </ul>
                <p className="mt-2">
                  O estabelecimento conecta o próprio número, pela API oficial da Meta ou pela
                  conexão rápida por QR code. A conexão por QR code não é oficial e pode levar o
                  WhatsApp a restringir ou bloquear o número; ao escolhê-la, o estabelecimento
                  assume esse risco. Custos cobrados pela Meta por mensagens enviadas fora da janela
                  de atendimento seguem a tabela da Meta. A Zaka não garante a entrega das
                  mensagens, que depende do WhatsApp, da Meta e do aparelho do destinatário.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">6. Agente de inteligência artificial</h2>
                <p>
                  O agente responde de forma automática e pode cometer erros. Ele usa os serviços,
                  preços e horários cadastrados e cria agendamentos que ainda precisam ser aceitos
                  pelo estabelecimento; o estabelecimento deve revisar o que ele registra e pode
                  desligá-lo ou assumir qualquer conversa a qualquer momento. O estabelecimento é
                  responsável pelas instruções que configura para o agente e por informar seus
                  clientes, quando necessário, de que parte do atendimento é automatizado.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">7. Uso aceitável</h2>
                <p>
                  Você concorda em não utilizar a Plataforma para fins ilícitos, para enviar
                  comunicações não solicitadas (spam) ou mensagens sem relação com agendamentos,
                  para tentar acessar dados de outros estabelecimentos, ou para qualquer atividade
                  que comprometa a segurança ou o funcionamento do serviço.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">8. Propriedade intelectual</h2>
                <p>
                  A marca, o software, o layout e os demais elementos da Plataforma pertencem à Zaka
                  e não podem ser copiados, reproduzidos ou distribuídos sem autorização.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">9. Limitação de responsabilidade</h2>
                <p>
                  A Plataforma é fornecida "como está". Fazemos o possível para manter o serviço
                  disponível e funcionando corretamente, mas não garantimos operação ininterrupta e
                  não nos responsabilizamos por perdas decorrentes de indisponibilidade, falhas
                  técnicas ou uso indevido por terceiros.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">10. Alterações nestes termos</h2>
                <p>
                  Podemos atualizar estes Termos periodicamente. Alterações relevantes serão
                  comunicadas nesta página, com a data de atualização revisada.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">11. Contato</h2>
                <p>
                  Dúvidas sobre estes Termos podem ser enviadas para o contato informado na página
                  inicial da Plataforma.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">CNPJ 67.596.409/0001-93</p>
                <p className="text-xs text-muted-foreground">
                  67.596.409 CALEB FERREIRA SOUTO DE OLIVEIRA
                </p>
              </section>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
