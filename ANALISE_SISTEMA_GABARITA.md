# Análise do Sistema Gabarita

## O que é o sistema
O **Gabarita** é uma plataforma web de preparação para concursos, com foco em planejamento de estudos, prática de questões, simulados, revisões e apoio de IA.

## Tecnologias usadas
- **Frontend e backend web:** Next.js 15 (App Router), React 19, TypeScript
- **Banco de dados:** PostgreSQL
- **ORM:** Prisma
- **Autenticação e segurança:** JWT (access + refresh) com `jose`, hash de senha com `bcryptjs`, rate limit
- **Validação:** Zod
- **Gráficos e visualização:** ApexCharts / react-apexcharts
- **E-mail:** Nodemailer
- **IA:** OpenAI Responses API com fallback para Ollama
- **Storage de arquivos:** upload local com controles de acesso e varredura opcional com ClamAV
- **Notificações:** e-mail, Telegram e Discord

## O que o sistema faz
- Cadastro/login, recuperação e redefinição de senha
- Gestão de planos de estudo, disciplinas e tópicos
- Geração de planejamento diário com IA (e fallback)
- Geração de questões por banca, tema e dificuldade
- Resolução de questões e acompanhamento de desempenho
- Criação e correção de simulados
- Correção de redação discursiva (texto, PDF e imagem)
- Agenda de revisões
- Dashboard com métricas, evolução e streak de estudos
- Biblioteca de materiais e anexos por tópico/plano
- Registro e análise de resultados de provas reais

## Texto para portfólio (versão principal)
Desenvolvi o **Gabarita**, uma plataforma SaaS de estudos para concursos que combina gestão de rotina com recursos de IA. A aplicação permite criar planos e cronogramas inteligentes, gerar e corrigir questões, montar simulados, revisar conteúdos e analisar desempenho com dashboards.  
**Stack principal:** Next.js 15, React 19, TypeScript, Prisma e PostgreSQL, com integrações de IA (OpenAI/Ollama), autenticação JWT, notificações multicanal e pipeline seguro de upload de arquivos.

## Texto curto para LinkedIn/CV (3 linhas)
Desenvolvimento full stack de plataforma de estudos para concursos com IA.  
Implementei planejamento inteligente, geração/correção de questões, simulados, revisões e dashboards de performance.  
Tecnologias: Next.js, React, TypeScript, Prisma, PostgreSQL, OpenAI/Ollama, JWT e integrações de notificação.

## Texto técnico para README
Plataforma de preparação para concursos construída com Next.js (App Router) e Prisma/PostgreSQL, com autenticação JWT, gerenciamento de trilha de estudos e recursos de IA para planejamento, geração de questões e correção discursiva. Inclui gestão de anexos, histórico de desempenho, simulados, revisões programadas e notificações multicanal (email/Telegram/Discord).
