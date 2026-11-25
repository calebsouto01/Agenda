# Servidor da conexão rápida (QR code)

A conexão rápida usa a Evolution API, que precisa de um servidor próprio (não roda no Supabase).
Este guia sobe tudo com um comando.

> Atenção: a conexão por QR code não é oficial do WhatsApp. Há risco de bloqueio do número se ele
> enviar muitas mensagens para quem não conversa com ele. A tela do app avisa o cliente disso.

## O que você precisa
- Um servidor Linux (VPS) com **2 GB de RAM** ou mais, com Docker instalado.
- Um **subdomínio** (ex.: `evolution.seudominio.com.br`) apontando para o IP do servidor
  (registro DNS do tipo **A**).
- As portas **80** e **443** abertas no servidor.

## Passo a passo
1. Copie a pasta `infra/evolution` para o servidor.
2. Crie o arquivo de configuração:
   ```bash
   cp .env.example .env
   ```
3. Gere duas senhas e cole no `.env`:
   ```bash
   openssl rand -hex 32   # EVOLUTION_API_KEY
   openssl rand -hex 16   # POSTGRES_PASSWORD
   ```
   Preencha também `EVOLUTION_DOMAIN` com o seu subdomínio.
4. Suba os serviços:
   ```bash
   docker compose up -d
   ```
5. Teste (deve responder com a versão da Evolution):
   ```bash
   curl https://SEU_SUBDOMINIO/
   ```

## Ligar ao Supabase
No Supabase (Edge Functions → Secrets), crie estes três segredos:

| Nome | Valor |
|---|---|
| `EVOLUTION_API_URL` | `https://SEU_SUBDOMINIO` (sem barra no final) |
| `EVOLUTION_API_KEY` | a mesma `EVOLUTION_API_KEY` do `.env` |
| `EVOLUTION_WEBHOOK_SECRET` | qualquer texto longo e aleatório, só seu |

Depois disso o botão **Conectar com QR code** do app passa a funcionar.

## Manutenção
- Ver logs: `docker compose logs -f evolution`
- Atualizar: `docker compose pull && docker compose up -d`
- Faça backup do volume `postgres_data` (guarda as conexões dos clientes).
