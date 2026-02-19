# Gabarita App

Plataforma web de preparação para concursos, com foco em planejamento de estudos, prática de questões, simulados, revisões e apoio de IA.

## Sobre o projeto

O **Gabarita** centraliza a rotina do concurseiro em um único produto:
- gestão de planos, disciplinas e tópicos;
- geração de cronograma diário com IA;
- geração e prática de questões por banca/tema/dificuldade;
- simulados com correção e histórico de tentativas;
- correção discursiva (texto/PDF/imagem);
- dashboard de desempenho com métricas de evolução;
- biblioteca de materiais, anexos e referências;
- monitor de concursos abertos e previstos com sincronização por feed/API;
- notificações diárias por e-mail, Telegram e Discord.

### Stack principal
- `Next.js 15` + `React 19` + `TypeScript`
- `PostgreSQL` + `Prisma`
- `JWT` (`jose`) + `bcryptjs`
- `OpenAI Responses API` com fallback para `Ollama`
- `Nodemailer`, `Zod`, `ApexCharts`
- Rate limit com `Upstash Redis` / `Postgres` / memória

## Base técnica
- `Next.js` (App Router + TypeScript)
- `PostgreSQL` + `Prisma`
- Autenticação com `JWT` (access + refresh)

## 1. Pré-requisitos

- Node.js 20+
- PostgreSQL 15+

## 2. Configuração

1. Copie variáveis:
```bash
cp .env.example .env
```

2. Ajuste `DATABASE_URL` e segredos no `.env`.

3. Instale dependências:
```bash
npm install
```

4. Gere client Prisma e rode migração:
```bash
npm run prisma:generate
npm run prisma:migrate -- --name init_auth
```

5. Inicie o projeto:
```bash
npm run dev
```

## 3. Rotas principais

- `GET /login`
- `GET /register`
- `GET /forgot-password`
- `GET /reset-password?token=...`
- `GET /dashboard` (protegida)

## 4. Endpoints de auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

## 5. Observações

- Em produção, o fluxo deve integrar serviço de e-mail para envio do link.
- Por segurança, `forgot-password` não devolve `resetToken` por padrão.
- Para testes locais, use `ALLOW_RESET_TOKEN_IN_RESPONSE=true` (somente fora de produção).
- O rate limit de autenticação suporta `RATE_LIMIT_DRIVER=auto|postgres|upstash|memory`.
- Em `auto`, a prioridade é: `upstash` (se configurado) e depois `postgres`.
- Se o backend escolhido falhar em runtime, há fallback para memória local.
- Para `upstash`, configure `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
- Mutations da API (plans/subjects/topics/sessions/uploads) usam limites centralizados por escopo.
- Ajuste global por ambiente com `MUTATION_RATE_LIMIT_MULTIPLIER` (ex.: `1` produção, `2` dev).
- Scan de anexos é opcional via `ENABLE_ATTACHMENT_SCAN`.
- Se ativar scan, execute o worker: `npm run scan:attachments` (run-once) ou `npm run scan:attachments:watch`.
- Com `ENFORCE_CLEAN_ATTACHMENT_ACCESS=true`, somente anexos com status `CLEAN` ficam disponíveis para download/preview.
- Monitor de concursos:
  - `CONCURSOS_FEED_URL`: fonte única (aceita `{uf}`).
  - `CONCURSOS_FEED_URLS`: múltiplas fontes separadas por vírgula (prioridade sobre URL única).
  - `CONCURSOS_FEED_TEMPLATE`: fallback padrão quando as duas acima estiverem vazias.
  - `CONCURSOS_FEED_TOKEN`: token Bearer opcional.
  - `CONCURSOS_REFRESH_MINUTES`: tempo de cache por UF no banco antes de consultar API de novo.
  - Comportamento atual: a tela abre com `RJ` por padrão; para cada UF, consulta fonte externa apenas se não houver dado salvo ou se o cache estiver vencido.
  - Fonte padrão no código: `https://www.pciconcursos.com.br/concursos/` com fallback para `CONCURSOS_FEED_TEMPLATE`.
