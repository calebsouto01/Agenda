# Conectar o projeto ao GitHub (Git Sync)

## Situação atual (verificada)
- O código do projeto está versionado no Git interno da Lovable, com 5 commits.
- O remote `origin` aponta para `git.private.lovable-gcp.code.storage` (armazenamento interno), **não** para o GitHub.
- **GitHub não está conectado** a este projeto.
- Não há conexão GitHub (App connector) no workspace que possa fazer sync de código.

## O que vou fazer (automatizado)
Nada. A sincronização bidirecional com GitHub é uma funcionalidade do editor da Lovable que só pode ser acionada por você na interface. Não há ferramenta do agente que execute essa conexão.

## O que você precisa fazer (manual, no editor da Lovable)
1. Abra o editor da Lovable deste projeto.
2. Clique no menu **(+)** no canto inferior esquerdo da barra de chat.
3. Selecione **GitHub → Connect project**.
4. Autorize o **Lovable GitHub App** na sua conta GitHub (se ainda não tiver autorizado).
5. Selecione a conta/organização GitHub onde o repositório será criado.
6. Clique em **Create Repository** — a Lovable cria um novo repositório GitHub com todo o código atual do projeto.

## O que acontece na conexão
- Todo o código atual (frontend, componentes, CSS, TypeScript, configurações, arquivos de execução) é enviado ao repositório GitHub.
- O histórico de commits existente é preservado.
- A sincronização passa a ser **bidirecional em tempo real**: edições no Lovable enviam para o GitHub, e pushes no GitHub sincronizam de volta para o Lovable.
- O estado atual do aplicativo é preservado exatamente — nenhuma funcionalidade ou layout é alterado.
- O Supabase permanece conectado; a conexão com o GitHub não afeta o backend.

## Sobre segredos
A Lovable gerencia a exclusão de segredos sensíveis no fluxo de sync. O arquivo `.env` e credenciais privadas **não** são expostos no repositório GitHub — apenas as variáveis públicas (`VITE_*`) e placeholders são versionados.

## Confirmar depois
Após você concluir a conexão no editor:
- Execute `git remote -v` (ou peça-me para verificar) — o `origin` deve apontar para `github.com`.
- Abra o repositório no GitHub e confirme que os arquivos e commits estão lá.
- Futuras alterações feitas no Lovable aparecerão automaticamente no GitHub.

## Observação
- Só é possível conectar **uma conta GitHub por vez** à conta Lovable.
- Repositórios GitHub existentes não podem ser importados diretamente; a Lovable cria um repositório novo na conexão.
- Para chamadas à **GitHub API** a partir do app (ex.: listar issues, PRs), isso é um recurso separado (GitHub Connector) — não é o mesmo que Git sync. Avise-me se também quiser isso.
