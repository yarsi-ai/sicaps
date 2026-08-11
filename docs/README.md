# SICAPS — Documentation Index

> **SICAPS** (Sistem Cerdas AI untuk Pemeriksaan Skabies)  
> Chatbot skrining skabies berbasis web untuk santri pondok pesantren

---

## Master Documents (All Phases)

| Document                                     | Description                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| [PRD.md](./PRD.md)                           | Product Requirements — user stories, scoring rules, fase roadmap        |
| [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md)     | Architecture, tech stack, project structure, deployment                 |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)   | Single source of truth untuk database design                            |
| [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Naming, folder structure, patterns, testing, git conventions            |
| [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) | LLM output testing, scoring accuracy, chat flow regression, CI pipeline |
| [DEPLOYMENT.md](./DEPLOYMENT.md)             | Environments, Vercel config, Supabase setup, CI/CD, monitoring          |

---

## Phase 1 — MVP

Skrining anonim, chat AI + questionnaire fallback, bilingual (ID/EN).

| Document                                                   | Description                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| [AI_BOT_SPEC.md](./phase-1/AI_BOT_SPEC.md)                 | Bot persona, conversation flow, extraction, scoring pipeline     |
| [API_SPEC.md](./phase-1/API_SPEC.md)                       | REST endpoints, request/response schemas, error codes            |
| [DESIGN_SPEC.md](./phase-1/DESIGN_SPEC.md)                 | UI/UX, visual styles, responsive layout, accessibility           |
| [BILINGUAL_SPEC.md](./phase-1/BILINGUAL_SPEC.md)           | English keyword tables, i18n architecture, translation keys      |
| [LLM_INTEGRATION.md](./phase-1/LLM_INTEGRATION.md)         | Streaming, prompt management, fallback strategy, cost estimation |
| [SCORING_ENGINE_SPEC.md](./phase-1/SCORING_ENGINE_SPEC.md) | Pattern matching algorithm, keyword pool, questionnaire scoring  |

---

## Feature Documentation

Dokumentasi detail per fitur yang sudah diimplementasi. Setiap fitur punya subfolder sendiri di [`docs/features/`](./features/).

| Feature                                             | Description                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [LLM Hardening](./features/llm-hardening/README.md) | Service layer hardening + internal testing console — streaming retry policy, TurnLog, observability dashboard |

---

## Guides — Operational Runbooks

Setup, konfigurasi, dan troubleshooting per provider.

| Document                                              | Description                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| [DEPLOY_GUIDE.md](./guides/DEPLOY_GUIDE.md)           | Step-by-step deploy ke production (Vercel + Supabase + Upstash)            |
| [LLM_SETUP.md](./guides/LLM_SETUP.md)                 | Provider options, arsitektur fallback, SDK setup                           |
| [HUGGINGFACE_GUIDE.md](./guides/HUGGINGFACE_GUIDE.md) | Panduan operasional HuggingFace: setup, pricing, tuning, troubleshooting   |
| [GROQ_GUIDE.md](./guides/GROQ_GUIDE.md)               | Panduan operasional Groq: setup, model options, free tier, troubleshooting |

---

## Phase 2 — Auth & Roles

Login/register, role management, dashboards, image assessment.

| Document                                                       | Description                                      |
| -------------------------------------------------------------- | ------------------------------------------------ |
| [IMAGE_ASSESSMENT_SPEC.md](./phase-2/IMAGE_ASSESSMENT_SPEC.md) | CV model for skin photo analysis                 |
| [API_ENDPOINTS.md](./phase-2/API_ENDPOINTS.md)                 | Auth, Admin, Doctor, Cadre, Region API endpoints |
| [INCOGNITO_SPEC.md](./phase-2/INCOGNITO_SPEC.md)               | Incognito screening mode (logged-in users)       |
| [DASHBOARD_SPEC.md](./phase-2/DASHBOARD_SPEC.md)               | Kader, Dokter, Admin dashboard specs             |

---

## Phase 3 — Enhancement

Statistik real-time, peta sebaran, notifikasi, PWA, self-deployed LLM.

> Dokumentasi akan ditambahkan saat Fase 3 dimulai.

---

## Quick Links

- **Scoring rules & keyword table:** [PRD.md §3.5](./PRD.md)
- **Prisma schema (MVP, copy-paste ready):** [DATABASE_SCHEMA.md §13](./DATABASE_SCHEMA.md)
- **System prompt template:** [AI_BOT_SPEC.md Appendix A](./phase-1/AI_BOT_SPEC.md)
- **TypeScript API types:** [API_SPEC.md Appendix A](./phase-1/API_SPEC.md)
- **Risk level thresholds:** ≥7 HIGH, 4–6 MODERATE, ≤3 LOW
