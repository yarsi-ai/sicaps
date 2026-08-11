# SICAPS — Deployment Guide

> **Reference:** [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) | [TESTING_STRATEGY.md](./TESTING_STRATEGY.md)  
> **Platform:** Vercel (free tier) + Supabase PostgreSQL  
> **Phase:** Phase 1 (MVP)  
> **Last updated:** July 2026

---

## 1. Environments

| Environment | Purpose    | URL                              | Database                    | LLM                       |
| ----------- | ---------- | -------------------------------- | --------------------------- | ------------------------- |
| Development | Local dev  | `localhost:3000`                 | Supabase CLI (local Docker) | Ollama (`qwen2.5:7b`)     |
| Preview     | PR testing | `sicaps-git-*.vercel.app` (auto) | `sicaps-dev` (remote)       | HuggingFace Inference API |
| Production  | Live users | `sicaps.vercel.app`              | `sicaps-prod` (remote)      | HuggingFace Inference API |

- No custom domain for MVP (Vercel subdomain sufficient)
- No staging branch — `main` is always production-ready
- Preview deployments auto-created by Vercel per PR

---

## 2. Supabase Setup

Supabase is used **only as a PostgreSQL host**. No Supabase SDK, Auth, RLS, Storage, or Realtime. Direct connection via Prisma ORM.

### 2.1 Projects

| Project       | Used by                               | Can reset?                 |
| ------------- | ------------------------------------- | -------------------------- |
| `sicaps-dev`  | Local dev (fallback) + Vercel preview | ✅ Yes — test data         |
| `sicaps-prod` | Vercel production only                | ❌ No — real research data |

### 2.2 Features Used (MVP)

| Feature        | Status      | Note                                           |
| -------------- | ----------- | ---------------------------------------------- |
| PostgreSQL     | ✅ Active   | Main database (via Prisma, bukan Supabase SDK) |
| Auth           | ❌ Inactive | Phase 2                                        |
| Storage        | ❌ Inactive | Phase 2 (image upload)                         |
| RLS Policies   | ❌ Inactive | App-level authorization via ShareToken         |
| Realtime       | ❌ Inactive | Not needed                                     |
| Edge Functions | ❌ Inactive | Using Vercel serverless                        |

### 2.3 Local Development

```bash
# Option A: Direct PostgreSQL (recommended — simpler)
# Install PostgreSQL locally or use Docker:
docker run --name sicaps-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

# Option B: Remote Supabase dev project
# Use sicaps-dev connection string directly
```

Set `DATABASE_URL` in `.env.local` accordingly.

### 2.4 Database Migrations

```bash
# Development — create new migration
npx prisma migrate dev --name <description>

# Production — apply pending migrations (runs in Vercel build)
npx prisma migrate deploy
```

**Breaking migrations** (drop column, rename) require 2-step deployment:

1. Deploy code that handles both old + new schema
2. Run migration
3. Deploy code that only uses new schema

**Important note — `DIRECT_URL` on Vercel:** `prisma migrate deploy` requires a direct/session-pooled connection to the database (`DIRECT_URL` in `schema.prisma`), different from `DATABASE_URL` used by app runtime (transaction pooler, port 6543). Supabase's direct connection (port 5432) requires IPv6, which Vercel's build environment doesn't support without a paid add-on — if `DIRECT_URL` points to the regular direct connection, build will fail with error `P1001: Can't reach database server`. Solution: set `DIRECT_URL` to **Session Pooler** connection string from Supabase (also port 5432, but IPv4-compatible), not the Direct Connection string.

---

## 3. Environment Variables

### 3.1 Complete Catalog

Source of truth: `src/lib/env.ts` (Zod schema).

| Variable                 | Required | Scope  | Description                                                                                         |
| ------------------------ | -------- | ------ | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | ✅       | Server | PostgreSQL connection string (Supabase or local)                                                    |
| `DIRECT_URL`             | Optional | Server | Direct/session-pooled connection, used by `prisma migrate deploy`. See note in 2.4.                 |
| `LLM_BASE_URL`           | ✅       | Server | LLM provider endpoint                                                                               |
| `LLM_API_KEY`            | ✅       | Server | LLM authentication token. Format: `hf_xxx` (HuggingFace), `gsk_xxx` (Groq)                          |
| `LLM_MODEL`              | Optional | Server | Model identifier (default: `qwen2.5:7b`)                                                            |
| `NEXT_PUBLIC_APP_URL`    | ✅       | Client | Base URL for shareable links                                                                        |
| `NEXT_PUBLIC_THEME`      | Optional | Client | UI theme name (default: `earthy`). Available: `earthy`, `purple`                                    |
| `NODE_ENV`               | Optional | Server | `development` / `production` / `test` (default: `development`)                                      |
| `LLM_FALLBACK_URL`       | Optional | Server | Fallback LLM provider endpoint. If set, `LLM_FALLBACK_KEY` and `LLM_FALLBACK_MODEL` also required.  |
| `LLM_FALLBACK_KEY`       | Optional | Server | Fallback LLM authentication token                                                                   |
| `LLM_FALLBACK_MODEL`     | Optional | Server | Fallback model identifier                                                                           |
| `LLM_TEMPERATURE_CHAT`   | Optional | Server | Chat turn temperature (default: `0.3`)                                                              |
| `LLM_TEMPERATURE_OUTPUT` | Optional | Server | Output generation temperature (default: `0.6`)                                                      |
| `LLM_MAX_TOKENS_CHAT`    | Optional | Server | Chat turn max tokens (default: `500`)                                                               |
| `LLM_MAX_TOKENS_OUTPUT`  | Optional | Server | Output generation max tokens (default: `800`)                                                       |
| `LLM_TOP_P`              | Optional | Server | Nucleus sampling (default: `0.9`)                                                                   |
| `LLM_TIMEOUT_MS`         | Optional | Server | LLM request timeout in ms (default: `12000`)                                                        |
| `LLM_RETRY_TIMEOUT_MS`   | Optional | Server | Retry attempt timeout in ms (default: `12000`)                                                      |
| `LLM_HEALTH_TIMEOUT_MS`  | Optional | Server | Health probe timeout in ms (default: `5000`)                                                        |
| `PLAYGROUND_GROQ_KEY`    | Optional | Server | Groq API key for LLM Playground                                                                     |
| `PLAYGROUND_HF_KEY`      | Optional | Server | HuggingFace key for LLM Playground                                                                  |
| `PLAYGROUND_GEMINI_KEY`  | Optional | Server | Gemini API key for LLM Playground                                                                   |
| `PLAYGROUND_OLLAMA_URL`  | Optional | Server | Ollama URL for LLM Playground                                                                       |

> **Note:** `LLM_FALLBACK_*` variabel bersifat all-or-nothing. Jika salah satu diset, ketiga-tiganya wajib ada.

### 3.2 Values Per Environment

| Variable              | Development                                            | Preview                            | Production                         |
| --------------------- | ------------------------------------------------------ | ---------------------------------- | ---------------------------------- |
| `DATABASE_URL`        | `postgresql://postgres:postgres@localhost:5432/sicaps` | `sicaps-dev` connection string     | `sicaps-prod` connection string    |
| `LLM_BASE_URL`        | `http://localhost:11434/v1`                            | `https://router.huggingface.co/v1` | `https://router.huggingface.co/v1` |
| `LLM_API_KEY`         | `ollama` (any non-empty string)                        | `hf_xxx`                           | `hf_xxx`                           |
| `LLM_MODEL`           | `qwen2.5:7b`                                           | `Qwen/Qwen2.5-7B-Instruct`         | `Qwen/Qwen2.5-7B-Instruct`         |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000`                                | `https://<branch>.vercel.app`      | `https://sicaps.vercel.app`        |

### 3.3 `.env.example`

Reflects actual `.env.example` in repository root:

```env
# =============================================================================
# SICAPS Environment Variables
# Copy this file to .env.local and fill in your values
# =============================================================================

# --- Required Variables ---

# PostgreSQL connection string (Supabase or local)
DATABASE_URL="postgresql://postgres:password@localhost:5432/sicaps"

# LLM provider base URL (Ollama OpenAI-compatible endpoint)
LLM_BASE_URL="http://localhost:11434/v1"

# LLM provider API key (required, min 1 character)
LLM_API_KEY="your-api-key-here"

# Public application URL (used for shareable links)
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# --- Optional Variables (defaults shown) ---

# LLM model identifier (default: qwen2.5:7b)
# LLM_MODEL="qwen2.5:7b"

# UI theme (default: earthy). Available: earthy, purple
# NEXT_PUBLIC_THEME="earthy"

# --- Playground Provider Keys (optional) ---
# PLAYGROUND_GROQ_KEY="gsk_xxxxxxxxxxxxx"
# PLAYGROUND_HF_KEY="hf_xxxxxxxxxxxxx"
# PLAYGROUND_GEMINI_KEY="AIza_xxxxxxxxxxxxx"
# PLAYGROUND_OLLAMA_URL="http://localhost:11434/v1"
```

### 3.4 Secrets Management

| Concern                 | Solution                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| Local dev               | `.env.local` (gitignored)                                                    |
| Vercel (preview + prod) | Vercel dashboard → Settings → Environment Variables (scoped per environment) |
| `.env.example`          | Committed to git — placeholder values only, never real secrets               |
| Key rotation            | Manual via Vercel dashboard                                                  |

### 3.5 Env Validation (Runtime)

All env vars validated at startup via Zod (`src/lib/env.ts`). App crashes immediately if any required variable is missing or malformed. See [CODING_STANDARDS.md](./CODING_STANDARDS.md) for conventions.

Key behaviors:

- LLM fallback variables validated as all-or-nothing group
- Generation parameters have sensible defaults — override only if needed
- Playground keys are fully optional — providers available only when configured

---

## 4. Vercel Configuration

### 4.1 `vercel.json`

```json
{
  "regions": ["sin1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### 4.2 `next.config.ts` Security Headers

```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'microphone=(self)' },
];

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
```

### 4.3 Free Tier Strategy

Vercel Hobby (free) limits serverless functions to **10 seconds**. The chat endpoint needs longer due to LLM response time.

**Solution: Streaming Response**

Chat endpoint uses `ReadableStream` to bypass the 10s timeout. Vercel doesn't kill streaming responses as long as data keeps flowing.

```typescript
// app/api/screening/chat/route.ts
import { OpenAIStream, StreamingTextResponse } from 'ai';

export async function POST(req: Request) {
  // 1. Validate input (< 1s)
  const input = chatSchema.parse(await req.json());

  // 2. Get session state (< 1s)
  const session = await screeningService.getSession(input.sessionId);

  // 3. Stream LLM response (bypasses 10s limit)
  const stream = await llm.chat.completions.create({
    model: env.LLM_MODEL,
    messages: buildMessages(session, input.message),
    stream: true,
    response_format: { type: 'json_object' },
  });

  // 4. Process streamed output, score, save, return
  const transformedStream = processAndScoreStream(stream, session);
  return new StreamingTextResponse(transformedStream);
}
```

**Client handling:**

- Client reads stream chunks progressively
- Final chunk contains complete JSON response (scores, result, etc.)
- Typing indicator shown while stream is in progress

### 4.4 Build Command

```json
// package.json
{
  "scripts": {
    "vercel-build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

Build order:

1. `prisma generate` — generate Prisma client
2. `prisma migrate deploy` — apply pending migrations to target DB
3. `next build` — build Next.js app

### 4.5 Region

| Setting           | Value                      | Rationale                           |
| ----------------- | -------------------------- | ----------------------------------- |
| Serverless region | `sin1` (Singapore)         | Lowest latency to Indonesia (~30ms) |
| Supabase region   | Southeast Asia (Singapore) | Colocated with Vercel functions     |

---

## 5. Rate Limiting

### 5.1 Implementation

SICAPS uses **in-memory sliding window rate limiting** — no external Redis dependency.

```typescript
// lib/rate-limiter.ts — in-memory, per serverless instance
export function safeCheckRateLimit(
  identifier: string,
  config: { maxRequests: number; windowSeconds: number },
): RateLimitResult { ... }
```

### 5.2 Configured Limits

| Endpoint                      | Scope      | Limit      |
| ----------------------------- | ---------- | ---------- |
| `/api/screening/start`        | IP         | 5 req/min  |
| `/api/screening/chat`         | Session ID | 10 req/min |
| `/api/screening/[id]/session` | IP         | 30 req/min |
| `/api/screening/result/[id]`  | IP         | 30 req/min |
| `/api/health`                 | IP         | 30 req/min |

### 5.3 Fail-Open Behavior

Rate limiter runs in-process — no external dependency that can fail. Limits reset on serverless cold-start (acceptable for MVP). HuggingFace provider has its own rate limits as natural throttle.

### 5.4 Phase 2 Consideration

For higher traffic in production, consider migrating to **Upstash Redis** (persistent rate limiting across instances). Environment variables `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are prepared in docs but not yet implemented.

---

## 6. CI/CD Pipeline

### 6.1 Deployment Flow

```mermaid
flowchart LR
    A["Push to<br/>feature branch"] --> B["GitHub Actions:<br/>unit + integration"]
    B --> C["Vercel:<br/>preview deploy"]
    C --> D["Open PR →<br/>E2E tests run"]
    D --> E{"All checks<br/>green?"}
    E -->|Yes| F["Merge to main"]
    E -->|No| G["Fix & re-push"]
    G --> B
    F --> H["Vercel: auto-deploy<br/>production<br/>(migrate + build)"]
    H --> I["UptimeRobot:<br/>confirm /api/health"]
```

### 6.2 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, 'feat/**', 'fix/**', 'refactor/**']
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check

  test-unit:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit

  test-integration:
    runs-on: ubuntu-latest
    needs: test-unit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:integration

  test-e2e:
    runs-on: ubuntu-latest
    needs: test-integration
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

```yaml
# .github/workflows/smoke.yml
name: Nightly Smoke Tests

on:
  schedule:
    - cron: '0 19 * * *' # 2 AM WIB (UTC+7)
  workflow_dispatch: # manual trigger

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run test:smoke
        env:
          LLM_BASE_URL: ${{ secrets.SMOKE_LLM_BASE_URL }}
          LLM_API_KEY: ${{ secrets.SMOKE_LLM_API_KEY }}
          LLM_MODEL: ${{ secrets.SMOKE_LLM_MODEL }}
      - name: Alert on failure
        if: failure()
        run: echo "Smoke tests failed — check logs"
        # Phase 2: integrate Slack/email notification
```

### 6.3 PR Merge Gates

PR to `main` requires **all green**:

- ✅ `quality` (typecheck + lint + format)
- ✅ `test-unit`
- ✅ `test-integration`
- ✅ `test-e2e`

### 6.4 Rollback

If production deploy breaks:

1. **Instant rollback** via Vercel dashboard (redeploy previous successful build)
2. Database: if migration caused issue → `prisma migrate resolve` + manual fix
3. No automated rollback — manual decision by developer

---

## 7. Monitoring

### 7.1 MVP Stack (Zero Cost)

| Concern         | Tool               | Setup                              |
| --------------- | ------------------ | ---------------------------------- |
| App health      | UptimeRobot (free) | Ping `GET /api/health` every 5 min |
| Deploy status   | Vercel dashboard   | Auto-alerts on build failures      |
| Function errors | Vercel Logs        | Filter by `console.error`          |
| Response times  | Vercel Analytics   | Built-in (free on Hobby)           |

### 7.2 Health Endpoint

```typescript
// app/api/health/route.ts
export async function GET() {
  let llmAvailable = false;
  try {
    // Quick ping to LLM (< 3s timeout)
    const res = await fetch(env.LLM_BASE_URL + '/models', {
      headers: { Authorization: `Bearer ${env.LLM_API_KEY}` },
      signal: AbortSignal.timeout(3000),
    });
    llmAvailable = res.ok;
  } catch {
    /* LLM unreachable */
  }

  return Response.json({
    data: { status: 'ok', llmAvailable },
    error: null,
    meta: { timestamp: new Date().toISOString(), requestId: crypto.randomUUID() },
  });
}
```

### 7.3 Logging Rules

| What                                | Level | Log?                               |
| ----------------------------------- | ----- | ---------------------------------- |
| Request start (sessionId, endpoint) | info  | ✅ `console.log`                   |
| LLM timeout / retry                 | warn  | ✅ `console.warn`                  |
| Rate limit triggered                | warn  | ✅ `console.warn`                  |
| Unexpected errors (with stack)      | error | ✅ `console.error`                 |
| Full user messages / health data    | —     | ❌ **NEVER**                       |
| LLM response body                   | —     | ❌ Production. ✅ Development only |

---

## 8. CORS & Security

### 8.1 CORS Policy (MVP)

**No CORS headers needed.** Frontend and API are same-origin (same Vercel deployment). External API access is not supported.

### 8.2 Microphone Permission

`Permissions-Policy: microphone=(self)` ensures only our domain can access the mic (prevents iframe abuse).

### 8.3 API Security (MVP)

| Concern               | Implementation                                     |
| --------------------- | -------------------------------------------------- |
| Authentication        | None (anonymous screening)                         |
| Authorization         | ShareToken for result access                       |
| Rate limiting         | In-memory sliding window (per serverless instance) |
| Input validation      | Zod on all endpoints                               |
| LLM output validation | Zod schema (malformed → retry → degrade)           |
| Secrets               | Server-only env vars, never `NEXT_PUBLIC_`         |

---

## 9. First-Time Setup Checklists

### 9.1 Local Development

```bash
# Prerequisites: Node.js 20+, Git

# 1. Clone & install
git clone <repo-url>
cd sicaps
npm install

# 2. Database setup (choose one)
# Option A: Local PostgreSQL (Docker)
docker run --name sicaps-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
# Option B: Use sicaps-dev remote Supabase project (no Docker needed)

# 3. Environment setup
cp .env.example .env.local
# Fill .env.local with DATABASE_URL, LLM_BASE_URL, LLM_API_KEY, NEXT_PUBLIC_APP_URL

# 4. Database migration
npx prisma generate
npx prisma migrate dev

# 5. Start local LLM (optional — fallback: use HuggingFace remote)
ollama pull qwen2.5:7b
ollama serve

# 6. Start dev server
npm run dev

# 7. Verify
# Open http://localhost:3000
# Check http://localhost:3000/api/health → { "data": { "status": "ok", "llmAvailable": true } }
```

**Without local LLM:**

- Set `LLM_BASE_URL=https://router.huggingface.co/v1` and `LLM_API_KEY=hf_xxx` in `.env.local`
- Everything else same

### 9.2 First Production Deploy

```
1. Create Supabase projects (as PostgreSQL host)
   - Go to supabase.com → New Project → "sicaps-dev" (region: Singapore)
   - Go to supabase.com → New Project → "sicaps-prod" (region: Singapore)
   - Note DATABASE_URL connection strings from each project

2. Get HuggingFace API key
   - Go to huggingface.co → Settings → Access Tokens → New token (read)

3. Connect repo to Vercel
   - Go to vercel.com → Import Git Repository
   - Select framework: Next.js (auto-detected)
   - Set root directory: ./

4. Set environment variables in Vercel
   - Settings → Environment Variables
   - Production: DATABASE_URL (sicaps-prod), NEXT_PUBLIC_APP_URL
   - Preview: DATABASE_URL (sicaps-dev), NEXT_PUBLIC_APP_URL
   - Shared: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL

5. Deploy
   - Push to main (or click "Deploy" in Vercel)
   - Vercel runs: prisma generate → prisma migrate deploy → next build
   - Verify deployment URL works

6. Setup monitoring
   - UptimeRobot → New Monitor → HTTP(s)
   - URL: https://sicaps.vercel.app/api/health
   - Interval: 5 minutes
   - Alert: email
```

### 9.3 Prerequisite Tools

| Tool        | Required    | Purpose          | Install            |
| ----------- | ----------- | ---------------- | ------------------ |
| Node.js 20+ | ✅          | Runtime          | nodejs.org         |
| npm 10+     | ✅          | Package manager  | Comes with Node.js |
| Git         | ✅          | Version control  | git-scm.com        |
| Docker      | Recommended | Local PostgreSQL | docker.com         |
| Ollama      | Recommended | Local LLM        | ollama.com         |

---

## 10. Phase 2+ Upgrades

| Area             | Current (MVP)                       | Phase 2 Upgrade                                              |
| ---------------- | ----------------------------------- | ------------------------------------------------------------ |
| Vercel plan      | Hobby (free) — streaming workaround | **Pro ($20/mo)** — 60s function timeout, no streaming needed |
| Rate limiting    | In-memory (per instance)            | **Upstash Redis** (persistent across instances)              |
| Monitoring       | Vercel logs + UptimeRobot           | Add Axiom/Logtail (structured logging)                       |
| Error tracking   | None                                | Add Sentry (free tier)                                       |
| Auth             | None (anonymous)                    | **Supabase Auth** (roles: santri, kader, dokter, admin)      |
| CORS             | Disabled (same-origin)              | Enable if external integrations needed                       |
| Domain           | `sicaps.vercel.app`                 | Custom domain (e.g., `sicaps.yarsi.ac.id`)                   |
| LLM              | HuggingFace Inference API           | Self-deployed (VPS) for lower latency + cost control         |
| Database         | Supabase free tier                  | Supabase Pro if approaching limits                           |
| CI notifications | Console output only                 | Slack/email on smoke test failures                           |
