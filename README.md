# Simply Booked

Crie neste projeto um Sistema Universal de Agendamento, conectado ao Supabase e ao GitHub já conectado.

O sistema deve funcionar para qualquer tipo de negócio que trabalhe com serviços e horários: barbearia, salão, clínica, oficina, autoelétrica, manicure, consultório etc.

1. ÁREA PÚBLICA

Criar uma página onde o cliente possa:

Visualizar o estabelecimento.

Escolher o serviço.

Escolher o profissional, quando aplicável.

Escolher uma data.

Visualizar somente horários disponíveis.

Informar nome, telefone/WhatsApp e e-mail opcional.

Confirmar o agendamento.

Receber uma confirmação na tela.

O sistema deve impedir reservas duplicadas.

2. ÁREA ADMINISTRATIVA

Criar uma área protegida por autenticação para o proprietário.

O administrador deve poder:

Visualizar agendamentos por dia, semana e mês.

Confirmar, cancelar e concluir agendamentos.

Cadastrar, editar e excluir serviços.

Definir preço e duração dos serviços.

Cadastrar profissionais.

Configurar dias e horários de funcionamento.

Bloquear horários.

Visualizar clientes.

Editar as informações do estabelecimento.

3. SUPABASE

Utilizar o Supabase como backend e banco de dados.

Criar e relacionar as estruturas necessárias para:

Estabelecimentos

Usuários/administradores

Serviços

Profissionais

Clientes

Agendamentos

Horários de funcionamento

Horários bloqueados

Implementar autenticação e políticas de segurança para impedir que um estabelecimento acesse os dados de outro.

4. MOTOR DE AGENDAMENTO

Os horários disponíveis devem ser calculados considerando:

Horário de funcionamento.

Duração do serviço.

Profissional.

Agendamentos existentes.

Horários bloqueados.

O sistema deve validar conflitos também no backend/banco de dados.

5. NOTIFICAÇÕES

Ao confirmar um agendamento:

Salvar imediatamente no Supabase.

Exibir o novo agendamento no painel administrativo.

Deixar a arquitetura preparada para futuras notificações por WhatsApp e e-mail.

Não implementar integração externa de WhatsApp nesta primeira versão.

6. INTERFACE

Criar uma interface moderna, limpa e responsiva, com prioridade para celular.

O sistema deve ser visualmente neutro e configurável para diferentes segmentos.

Não criar regras específicas para um tipo de negócio.

7. ARQUITETURA

O projeto já está conectado ao GitHub.

Não criar outro repositório.

Organize o código para que o projeto possa ser versionado e publicado posteriormente.

Use o Supabase como backend, mantendo frontend e backend devidamente separados.

8. FLUXO PRINCIPAL

Administrador:

Cria estabelecimento → cadastra serviços → configura horários → cadastra profissionais, se necessário.

Cliente:

Acessa página → escolhe serviço → escolhe profissional, se necessário → escolhe data → escolhe horário disponível → informa dados → confirma.

Sistema:

Valida disponibilidade → salva no Supabase → confirma para o cliente → disponibiliza o novo agendamento no painel administrativo.

Construa uma aplicação funcional, e não apenas uma demonstração visual.

Ao finalizar, teste o fluxo completo de criação e gerenciamento de um agendamento.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cdb54d12-8c87-40f4-b277-96cdcc4731c8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
