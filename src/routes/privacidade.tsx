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
                Última atualização: novembro de 2026
              </p>
            </div>

            <div className="space-y-5 text-sm leading-relaxed text-foreground/90">
              <section>
                <h2 className="mb-1 text-sm font-bold">1. Quem somos e nosso papel</h2>
                <p>
                  A Zaka (CNPJ 67.596.409/0001-93) opera esta plataforma de agendamento online, em
                  conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018). Em
                  relação aos dados dos <strong>clientes finais</strong> de cada estabelecimento, o
                  estabelecimento é o controlador (decide para que usar) e a Zaka atua como
                  operadora, tratando os dados em nome dele. Em relação aos dados da conta do
                  próprio estabelecimento, a Zaka é a controladora.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">2. Quais dados coletamos</h2>
                <p>Coletamos os seguintes dados, conforme o uso da Plataforma:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <strong>Dados do estabelecimento:</strong> nome, e-mail de acesso, telefone,
                    endereço, descrição, serviços, preços, profissionais, os serviços que cada
                    profissional realiza e horários de funcionamento, cadastrados por quem
                    administra o negócio. Também guardamos o plano contratado (Grátis, Pro ou
                    Premium).
                  </li>
                  <li>
                    <strong>Dados de clientes finais:</strong> nome, telefone e e-mail (quando
                    informado) ao realizar um agendamento, além do histórico de agendamentos,
                    pagamentos registrados pelo estabelecimento e as respostas do cliente aos avisos
                    (confirmou presença ou cancelou).
                  </li>
                  <li>
                    <strong>Conexão com o WhatsApp (planos Pro e Premium):</strong> quando o
                    estabelecimento conecta um número, guardamos o identificador do número e da
                    conta comercial, o telefone conectado, o estado da conexão e a credencial de
                    acesso fornecida pela Meta (ou, na conexão rápida por QR code, o identificador
                    da sessão). Essas credenciais ficam armazenadas de forma restrita, inacessíveis
                    ao navegador, e são removidas ao desconectar.
                  </li>
                  <li>
                    <strong>
                      Conversas de WhatsApp (plano Premium, com o agente de IA ligado):
                    </strong>{" "}
                    número e nome de perfil de quem escreve ao número conectado, e o texto das
                    mensagens trocadas com o agente, usadas para responder, manter o contexto da
                    conversa e permitir que o estabelecimento assuma o atendimento.
                  </li>
                  <li>
                    <strong>Contatos do celular (somente no aplicativo Android):</strong> quando o
                    administrador usa o aplicativo instalado e toca em "Importar contatos do
                    celular", solicitamos permissão do Android para ler a agenda do aparelho. A
                    leitura só ocorre com autorização explícita a cada uso, e apenas nome e telefone
                    dos contatos selecionados são salvos, na conta daquele estabelecimento. Não
                    lemos nenhum outro dado do celular.
                  </li>
                  <li>
                    <strong>Preferências no aparelho:</strong> guardamos no próprio navegador ou
                    aplicativo apenas configurações de conveniência (por exemplo, se os alertas na
                    tela estão ligados). Não usamos cookies de publicidade nem de rastreamento.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">3. Como usamos os dados</h2>
                <p>Usamos os dados exclusivamente para operar a Plataforma:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>autenticar contas, exibir a agenda e processar agendamentos;</li>
                  <li>
                    avisar o cliente por WhatsApp quando o estabelecimento aceita o agendamento e
                    enviar um lembrete no dia (planos Pro e Premium), com opção de confirmar ou
                    cancelar a presença;
                  </li>
                  <li>
                    no plano Premium, responder mensagens recebidas no WhatsApp por meio de um
                    agente de inteligência artificial, que consulta serviços, profissionais e
                    horários livres e cria agendamentos que o estabelecimento depois aceita ou
                    recusa;
                  </li>
                  <li>
                    gerar relatórios financeiros e de clientes para o próprio estabelecimento, e
                    mostrar a ele há quantos dias cada cliente não é atendido.
                  </li>
                </ul>
                <p className="mt-2">
                  Não usamos esses dados para publicidade, não os vendemos e não os usamos para
                  treinar modelos de inteligência artificial.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">4. Compartilhamento com prestadores</h2>
                <p>
                  Para prestar o serviço, os dados necessários são tratados por prestadores que
                  atuam como operadores técnicos, sob obrigações de confidencialidade e segurança:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <strong>Supabase:</strong> banco de dados, autenticação e execução das funções
                    do servidor;
                  </li>
                  <li>
                    <strong>Vercel:</strong> hospedagem do site e do painel;
                  </li>
                  <li>
                    <strong>Meta (WhatsApp Business Platform):</strong> envio e recebimento das
                    mensagens na conexão oficial. O tratamento pela Meta segue os termos e a
                    política de privacidade do WhatsApp;
                  </li>
                  <li>
                    <strong>Anthropic (Claude):</strong> no plano Premium, o texto da conversa e as
                    informações necessárias para responder (serviços, horários e dados do
                    estabelecimento) são enviados para gerar a resposta do agente de IA;
                  </li>
                  <li>
                    <strong>Servidor de conexão rápida (Evolution API):</strong> quando o
                    estabelecimento escolhe conectar por QR code, as mensagens passam por um
                    servidor operado pela Zaka para ligar o aparelho ao agente.
                  </li>
                </ul>
                <p className="mt-2">
                  Não compartilhamos dados com outros terceiros, exceto quando exigido por lei ou
                  ordem judicial. Alguns desses prestadores podem processar dados fora do Brasil,
                  com as salvaguardas previstas na LGPD.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">5. Armazenamento e segurança</h2>
                <p>
                  Os dados de cada estabelecimento ficam isolados por conta, com controle de acesso
                  em nível de linha no banco de dados, que impede que um estabelecimento veja os
                  dados de outro. Toda a Plataforma usa conexões criptografadas (HTTPS). Credenciais
                  de integração ficam em tabelas sem acesso pelo navegador, e as mensagens recebidas
                  do WhatsApp têm a assinatura verificada antes de serem processadas.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">6. Seus direitos</h2>
                <p>Conforme a LGPD, você pode solicitar a qualquer momento:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Confirmação de que tratamos seus dados e acesso a eles;</li>
                  <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                  <li>
                    Exclusão de dados pessoais (clientes e contatos importados podem ser excluídos
                    diretamente pelo estabelecimento no painel);
                  </li>
                  <li>Informações sobre com quem compartilhamos seus dados;</li>
                  <li>Revogação do consentimento e oposição ao tratamento, quando aplicável.</li>
                </ul>
                <p className="mt-2">
                  Se você é cliente de um estabelecimento, o pedido pode ser feito a ele ou a nós;
                  nós o encaminhamos ao estabelecimento quando for o caso. Quem não quiser receber
                  mensagens automáticas por WhatsApp pode pedir ao estabelecimento para ser excluído
                  dos avisos, ou simplesmente nos avisar.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">
                  7. Responsabilidades do estabelecimento e uso do WhatsApp
                </h2>
                <p>
                  O estabelecimento é responsável por ter base legal para contatar seus clientes,
                  por usar a Plataforma apenas para avisos ligados a agendamentos e por respeitar as
                  políticas do WhatsApp. A conexão oficial (API da Meta) segue regras próprias da
                  Meta, incluindo modelos de mensagem aprovados e janela de atendimento de 24 horas.
                  A conexão rápida por QR code não é oficial: o WhatsApp pode restringir ou bloquear
                  números que usam essa forma de conexão, risco que o estabelecimento assume ao
                  escolhê-la. O plano Pro/Premium com a conexão oficial é a opção recomendada.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">8. Retenção de dados</h2>
                <p>
                  Mantemos os dados enquanto a conta do estabelecimento estiver ativa, ou pelo tempo
                  necessário para cumprir obrigações legais. O histórico de conversas do agente é
                  mantido para dar contexto ao atendimento e pode ser excluído a pedido. Ao
                  desconectar o WhatsApp, as credenciais da conexão são apagadas. Dados podem ser
                  excluídos a pedido do estabelecimento ou do titular, respeitadas eventuais
                  obrigações legais de retenção.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">9. Alterações nesta política</h2>
                <p>
                  Podemos atualizar esta Política periodicamente. Alterações relevantes serão
                  comunicadas nesta página, com a data de atualização revisada.
                </p>
              </section>

              <section>
                <h2 className="mb-1 text-sm font-bold">10. Contato</h2>
                <p>
                  Para exercer seus direitos ou tirar dúvidas sobre esta Política, entre em contato
                  pelos canais informados na página inicial da Plataforma.
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
