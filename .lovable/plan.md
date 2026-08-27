# Conectar o projeto ao GitHub — repositório calebsouto01/Agenda

## Situação atual (verificada)
- Código do projeto está versionado no Git interno da Lovable (5 commits).
- `origin` aponta para `git.private.lovable-gcp.code.storage` (interno), **não** para o GitHub.
- GitHub **não conectado** ao projeto.
- O app se chama "Agenda" (títulos das páginas).
- O repositório `calebsouto01/Agenda` no GitHub está **vazio** (sem conteúdo/histórico a preservar).
- Limitação confirmada (docs da Lovable): o Git Sync da Lovable **sempre cria um repositório novo** — não conecta a um repositório GitHub já existente. Eu também não posso executar `git push`/`git remote add` por aqui (o estado do Git é gerenciado internamente).

## Por que você não precisa abrir mão do sync
Como `Agenda` está vazio, dá para ter **o nome `calebsouto01/Agenda` E o sync bidirecional automático**. Basta apagar o repo vazio e deixar a Lovable recriá-lo. Você perde nada (estava vazio) e ganha sync automático com o Lovable para sempre.

---

## Caminho A (RECOMENDADO): Agenda com sync bidirecional automático

Você executa no editor da Lovable:

1. No GitHub, **apague** o repositório vazio `calebsouto01/Agenda`
   (Settings → Danger Zone → Delete this repository).
2. No editor da Lovable deste projeto, clique no menu **(+)** no canto inferior esquerdo do chat.
3. Selecione **GitHub → Connect project**.
4. Autorize o **Lovable GitHub App** na sua conta GitHub (se ainda não autorizou).
5. Selecione a conta/organização **calebsouto01**.
6. Crie o repositório com o nome **Agenda** (a Lovable cria o repo novo com todo o código atual).

Resultado:
- Todo o código atual (frontend, componentes, CSS, TS, configurações, arquivos de execução) vai para `calebsouto01/Agenda`.
- Histórico de commits preservado.
- **Sync bidirecional em tempo real**: edições no Lovable → GitHub, e pushes no GitHub → Lovable.
- Estado do app preservado; Supabase permanece conectado.
- Segredos (`SUPABASE_SERVICE_ROLE_KEY`, `.env` privadas) **não** expostos — a Lovable filtra segredos no sync; só `VITE_*` públicas são versionadas.

Confirmar depois: `git remote -v` deve apontar para `github.com`; abra `calebsouto01/Agenda` no GitHub e confirme arquivos + commits.

---

## Caminho B (alternativa, sem sync): push único manual para o Agenda existente

Se você prefere manter o `Agenda` atual (vazio) e só quer o código lá, **sem sync automático**:

1. No editor da Lovable, abra o **Code Editor** → **Download codebase** (requer plano pago)
   e baixe o ZIP do projeto.
2. No seu computador:
   ```bash
   git clone https://github.com/calebsouto01/Agenda.git
   cd Agenda
   # extraia o ZIP baixado e copie todos os arquivos para esta pasta
   git add .
   git commit -m "Importa projeto Agenda (Lovable)"
   git push origin main
   ```
3. Abra `calebsouto01/Agenda` no GitHub e confirme os arquivos.

Observações do Caminho B:
- É um **push único**. Alterações futuras feitas no Lovable **não** vão para o GitHub sozinhas — você teria que repetir o download/push.
- O histórico de commits da Lovable não é transferido (começa um histórico novo).
- Segredos: o ZIP da Lovable já exclui credenciais privadas; ainda assim revise antes de commitar para garantir que `.env` com chaves reais não suba.

---

## Recomendação
Use o **Caminho A**. Como `Agenda` está vazio, ele entrega o nome de repo que você quer (`calebsouto01/Agenda`) **com** sync automático, sem perder nada. O Caminho B só faz sentido se você quiser manter o repo atual inalterado e abrir mão do sync.

## Observação
- Só é possível conectar **uma conta GitHub por vez** à conta Lovable.
- Se você também quiser que o **app** chame a GitHub API (listar issues/PRs via código), isso é um recurso separado (GitHub Connector) — me avise.
