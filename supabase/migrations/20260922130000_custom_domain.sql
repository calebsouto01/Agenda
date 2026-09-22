-- Domínio próprio por estabelecimento: o dono cadastra o domínio nas
-- configurações, aponta o DNS (CNAME) pro Vercel, e a home (src/routes/index.tsx)
-- detecta o Host da requisição e serve a página de agendamento daquele
-- estabelecimento em vez do site da Zaka. A adição do domínio no projeto
-- Vercel (pra ele resolver e ganhar certificado SSL) é um passo manual feito
-- fora do app quando o cliente pede — ver instruções na tela de configurações.
ALTER TABLE public.establishments
  ADD COLUMN custom_domain text UNIQUE;

-- Guarda sempre em minúsculas e sem espaço, sem exigir isso na aplicação toda vez.
ALTER TABLE public.establishments
  ADD CONSTRAINT establishments_custom_domain_format
  CHECK (custom_domain IS NULL OR custom_domain = lower(btrim(custom_domain)));
