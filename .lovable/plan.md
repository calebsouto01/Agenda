# Usuário padrão: Admin / Admin

Objetivo: poder entrar no painel digitando **Admin** como usuário e **Admin** como senha, sem passar por criação de conta.

## Como vai funcionar

- A tela de login passa a aceitar **usuário ou e-mail** no primeiro campo.
- Ao digitar `Admin`, o sistema entende internamente como a conta padrão `admin@agenda.local`.
- A senha digitada `Admin` também é convertida internamente para uma versão válida (o serviço de autenticação exige no mínimo 6 caracteres, então "Admin" sozinho seria recusado). Para o usuário, a experiência é exatamente: usuário `Admin`, senha `Admin`.
- A conta padrão é criada uma única vez, já confirmada, para entrar direto no painel.
- Sem dados de demonstração: ao entrar pela primeira vez, o usuário padrão segue o onboarding normal de cadastro do estabelecimento.

## O que muda na tela de login

- Rótulo do primeiro campo passa de "E-mail" para "Usuário ou e-mail".
- Texto de ajuda discreto indicando o acesso padrão (`Admin / Admin`).
- Login por e-mail comum e Google continuam funcionando como hoje.

## Aviso de segurança

`Admin / Admin` é uma credencial de demonstração e é facilmente adivinhável. Antes de publicar o app para uso real, o ideal é trocar essa senha (ou remover o usuário padrão). Posso incluir depois uma tela de troca de senha no painel.

## Detalhes técnicos

- Ativar auto-confirmação de e-mail para que a conta padrão entre sem verificação por link.
- Criar o usuário padrão via API de administração (server function protegida por chamada única/idempotente), com e-mail `admin@agenda.local` e senha derivada determinística.
- Em `src/routes/auth.tsx`: normalizar a entrada — se não contiver `@`, mapear `usuario` → `usuario@agenda.local`; ajustar o schema Zod para aceitar identificador com mínimo de 3 caracteres e senha com mínimo de 4, aplicando a derivação de senha antes de chamar `signInWithPassword`.
- Nenhuma mudança de layout, rotas, RLS ou lógica de agendamento.
