# OnboardAI — Project Roadmap & Technical Specification

**Purpose of this document:** hand this to Claude Code as the starting context for building the OnboardAI prototype. It defines scope, architecture, data model, API contract, security requirements, and a day-by-day build order.

---

## 1. Project Overview

OnboardAI replaces manual spreadsheet-based trainee onboarding tracking with a small web app. A manager types a plain-language instruction ("Create onboarding tasks: Security Course, AI Training, due July 18") and the system creates trackable tasks per trainee. Trainees get a dashboard to mark tasks complete. Managers/SPOCs get a live view of who's on track instead of chasing status manually.

This is a **prototype/demo**, not a production system. It exists to prove the concept works before asking for any real infrastructure, access, or budget.

## 2. Scope & Non-Goals

**In scope:**
- Fake/sample data only — no real trainee or employee information, nothing touching company systems
- A small working demo built on a personal machine and free-tier services
- Roughly 2–3 weeks of part-time build effort
- Enough functionality to walk a manager through a live demo

**Explicitly out of scope for this phase:**
- Real trainee data or integration with any company system
- SSO / Entra ID integration (design for it, don't build it yet — see §8)
- Formal security review, penetration testing, or compliance sign-off
- High availability, horizontal scaling, or production SLAs
- Multi-tenant support

Everything in "explicitly out of scope" is still designed for structurally (clean auth boundary, no hardcoded secrets, etc.) so the jump to production later is additive, not a rewrite.

## 3. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript | Framework you already know; Vite keeps dev/build simple |
| Styling | Tailwind CSS | Fast to build with, no design-system overhead for a demo |
| Backend | Node.js + Express + TypeScript | Framework you already know |
| ORM | Prisma | Schema-as-code, parameterized queries by default (prevents SQL injection), generates TypeScript types |
| Database | PostgreSQL on Supabase or Neon (free tier) | Both are free-tier, fully managed Postgres, no server to maintain. Use Supabase if you want built-in auth as a fallback option later; use Neon if you want the leanest possible Postgres-only instance. Either works with Prisma unchanged. |
| Auth | JWT (access + refresh tokens), bcrypt password hashing | Standard, well-understood, no vendor lock-in |
| Conversational agent | Microsoft Copilot Studio, calling the Express API as a custom action via an OpenAPI-defined connector | Handles NL parsing and response phrasing natively — no custom LLM integration code to build or maintain. Express stays the source of truth; Copilot Studio only ever talks to it through the same authenticated API surface everything else uses. |
| Validation | Zod | Shared validation schemas between routes and (optionally) frontend forms |
| Hosting (demo) | Frontend: Vercel or Netlify free tier · Backend: Render or Railway free tier · DB: Supabase/Neon free tier | All three give HTTPS by default at no cost |

## 4. Architecture

```
┌─────────────┐      HTTPS       ┌──────────────┐      Prisma       ┌──────────────┐
│   React SPA │ ───────────────► │  Express API │ ─────────────────► │  PostgreSQL  │
│  (Vercel)   │ ◄─────────────── │   (Render)   │ ◄───────────────── │ (Supabase/   │
└─────────────┘   JSON + JWT     └──────┬───────┘                    │   Neon)      │
                                         ▲
                                         │ custom connector
                                         │ (OpenAPI + API key/OAuth)
                                  ┌──────┴───────┐
                                  │ Copilot Studio│
                                  │    Agent      │
                                  │ (chat surface)│
                                  └───────────────┘
```

The React app and Copilot Studio are two front doors onto the same Express API — neither talks to the database directly, and there is no separate LLM integration to maintain in the backend. Copilot Studio's own generative capability handles parsing the manager's plain-language instructions and phrasing responses; Express only ever receives clean, structured, already-validated requests and applies the same auth/validation/business rules regardless of which front door they came through.

## 5. Data Model

Keeping the same schema already validated in the Power Platform prototype (SharePoint Lists), so the mental model and any existing fake data map over directly.

```prisma
// schema.prisma

model Trainee {
  id          String   @id @default(cuid())
  traineeId   Int      @unique   // e.g. 1234 — human-readable ID, distinct from internal id
  name        String
  email       String   @unique
  spoc        String?
  batch       String
  status      TraineeStatus @default(ACTIVE)
  tasks       Task[]
  attendance  Attendance[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum TraineeStatus {
  ACTIVE
  COMPLETED
  ON_HOLD
}

model Task {
  id          String   @id @default(cuid())
  taskName    String
  description String?
  assignedTo  Trainee  @relation(fields: [traineeId], references: [id])
  traineeId   String
  dueDate     DateTime
  priority    Priority @default(MEDIUM)
  status      TaskStatus @default(PENDING)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum Priority {
  LOW
  MEDIUM
  HIGH
}

enum TaskStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

model Attendance {
  id        String   @id @default(cuid())
  trainee   Trainee  @relation(fields: [traineeId], references: [id])
  traineeId String
  date      DateTime
  status    AttendanceStatus @default(PRESENT)
}

enum AttendanceStatus {
  PRESENT
  ABSENT
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         UserRole
  traineeId    String?  // set only if role = TRAINEE, links to their Trainee record
  createdAt    DateTime @default(now())
}

enum UserRole {
  MANAGER
  SPOC
  TRAINEE
  ADMIN
}
```

## 6. API Specification

All routes prefixed `/api`. All routes except `/auth/*` require a valid JWT in the `Authorization: Bearer <token>` header.

| Method | Route | Role(s) | Purpose |
|---|---|---|---|
| POST | `/auth/login` | — | Email + password → JWT pair |
| POST | `/auth/refresh` | — | Refresh token → new access token |
| GET | `/trainees` | Manager, SPOC, Admin | List all trainees |
| GET | `/trainees/:id` | Manager, SPOC, Admin, self (Trainee) | Single trainee detail |
| POST | `/trainees` | Manager, Admin | Create trainee |
| PATCH | `/trainees/:id` | Manager, Admin | Update trainee |
| GET | `/tasks` | Manager, SPOC, Admin | List tasks, filterable by `?status=`, `?traineeId=`, `?overdue=true` |
| GET | `/tasks/mine` | Trainee | Tasks assigned to the logged-in trainee |
| POST | `/tasks` | Manager, Admin | Create a task (structured). Called by the React form directly, and by the Copilot Studio agent after it parses a manager's plain-language instruction. |
| PATCH | `/tasks/:id` | Manager, Admin | Update a task |
| PATCH | `/tasks/:id/complete` | Trainee (own task only) | Mark a task complete |
| GET | `/attendance` | Manager, SPOC, Admin | List attendance, filterable by `?traineeId=`, `?dateRange=` |
| POST | `/attendance` | Manager, SPOC, Admin | Record attendance |
| GET | `/reports/weekly-summary` | Manager, SPOC, Admin | Returns structured stats only (completion %, overdue count, attendance %). Copilot Studio phrases this conversationally; Express never generates the wording. |
| GET | `/reports/risk-flags` | Manager, SPOC, Admin | Returns trainees meeting deterministic risk criteria as structured data. Copilot Studio writes the per-trainee explanation when asked. |

## 7. AI Feature Specification

The natural-language layer lives in **Copilot Studio**, not in the Express backend. Express exposes plain structured endpoints; Copilot Studio is responsible for turning a manager's typed sentence into a call against them, and for phrasing responses back into natural language.

1. **Task creation from natural language.** The manager types an instruction into the Copilot Studio chat surface (embedded in the React app or used standalone). Copilot Studio's own generative action extracts the parameters (task name, description, priority, due date, which trainees/batch) and calls `POST /tasks` on the Express API with clean structured JSON — the same endpoint the React "create task" form uses. Express validates with the same Zod schema either way; it has no idea whether the request came from a human filling a form or Copilot Studio, which is exactly the point.
2. **Weekly summary.** `GET /reports/weekly-summary` returns structured stats only (completion %, overdue count, attendance %) — no natural-language generation happens in Express at all. When a manager asks the Copilot Studio agent "give me a weekly summary," the agent calls this endpoint and phrases the numbers conversationally. The backend never invents wording; it only ever returns numbers it computed deterministically.
3. **Risk flags.** Same pattern — `GET /reports/risk-flags` returns trainees meeting deterministic risk criteria (e.g. 2+ overdue tasks, attendance <80%) as structured data (no LLM call in Express). Copilot Studio writes the one-line explanation per flagged trainee when a manager asks about it conversationally.

This split matters: the numbers your manager sees are always computed in code you can test and trust, and the only place natural language gets generated is Copilot Studio — which also means there's no LLM API key, prompt-injection surface, or model-output-validation burden inside your own backend at all.

## 8. Authentication & Authorization

- Passwords hashed with **bcrypt** (cost factor 12), never stored or logged in plaintext.
- JWT access tokens short-lived (15 min), refresh tokens longer-lived (7 days) and stored as httpOnly, secure, sameSite cookies — not localStorage, to reduce XSS token-theft risk.
- Role check (`MANAGER` / `SPOC` / `TRAINEE` / `ADMIN`) enforced in Express middleware on every protected route, not just in the frontend.
- **Designed-for-later, not built now:** the User model and auth middleware are structured so swapping local JWT auth for Entra ID / SSO later means changing the login route's internals, not the rest of the app.

## 9. Security Requirements (enterprise-friendly checklist)

- [ ] All secrets (DB connection string, JWT signing secret, LLM API key) in environment variables via `.env`, which is `.gitignore`'d — never committed, never hardcoded
- [ ] `helmet` middleware for secure HTTP headers
- [ ] `express-rate-limit` on all routes, tighter limits on `/auth/*` and the AI endpoints specifically
- [ ] `cors` configured with an explicit allowed-origins list, not `*`
- [ ] All inputs validated with Zod at the route boundary before touching the database
- [ ] All DB access through Prisma (parameterized by default) — no raw string-concatenated SQL anywhere
- [ ] HTTPS enforced in production (free-tier hosts above provide this by default)
- [ ] Least-privilege DB user/connection string — the app's DB role should not have superuser rights
- [ ] `npm audit` run before each deploy; consider enabling Dependabot on the repo
- [ ] No PII beyond the fake demo data for this phase — enforce this by code review, not just intent
- [ ] Basic audit log (who did what, when) on task/attendance writes — table for this can be added later; not blocking for the demo, but worth stubbing a `createdBy` field now on writes

## 10. Suggested Project Structure

```
onboardai/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── ManagerDashboard.tsx
│   │   │   ├── TraineeDashboard.tsx
│   │   │   └── Login.tsx
│   │   ├── lib/api.ts        # fetch wrapper, attaches JWT
│   │   └── App.tsx
│   ├── .env.example
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── trainees.ts
│   │   │   ├── tasks.ts
│   │   │   ├── attendance.ts
│   │   │   └── reports.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts       # JWT verify + role check
│   │   │   └── validate.ts   # Zod validation wrapper
│   │   ├── openapi.yaml      # API definition Copilot Studio's custom connector imports
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── index.ts
│   ├── .env.example
│   └── package.json
└── README.md
```

## 11. Environment Variables

```
# backend/.env
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
COPILOT_CONNECTOR_API_KEY=      # separate key/secret the Copilot Studio custom connector authenticates with
ALLOWED_ORIGINS=http://localhost:5173

# frontend/.env
VITE_API_BASE_URL=http://localhost:3000/api
```

Give the Copilot Studio connector its own API key (or OAuth client), distinct from any human user's JWT — this lets you scope, rotate, or revoke the agent's access to the API independently of your own login, and keeps an audit trail of which requests came from the agent versus a person.

`.env.example` files (committed, no real values) should exist in both folders so Claude Code — or anyone else — knows what to configure without guessing.

## 12. Roadmap

**Week 1 — Backend foundation**
- Day 1–2: Repo scaffold, Prisma schema, migrations, seed script with fake data (reuse the same fake dataset already generated for the Power Platform version)
- Day 3–4: Auth (register/login/refresh), role middleware, Trainee + Task + Attendance CRUD routes
- Day 5: Postman/Thunder Client pass over every endpoint; fix anything broken before touching the frontend

**Week 2 — Frontend + Copilot Studio agent**
- Day 1–2: React app shell, login flow, Manager dashboard (task list, create task form)
- Day 3: Trainee dashboard (their tasks, mark-complete action)
- Day 4: Write `openapi.yaml` for the Express API, deploy backend somewhere reachable (even a temporary Render URL), build the Copilot Studio custom connector against it, and secure it with `COPILOT_CONNECTOR_API_KEY`
- Day 5: Build the Copilot Studio agent itself — actions for "create task from instruction" (→ `POST /tasks`), "weekly summary" (→ `GET /reports/weekly-summary`), "risk flags" (→ `GET /reports/risk-flags`); test each in the Copilot Studio test chat pane

**Week 3 — Polish, deploy, rehearse**
- Day 1: Deploy frontend (Vercel), backend (Render), DB (Supabase/Neon); confirm env vars and CORS work across the deployed URLs
- Day 2–3: Bug pass, empty-state and error-state handling, mobile responsiveness check
- Day 4: Write the "what a production version needs" one-pager (SSO integration, real data governance, audit logging, security review)
- Day 5: Full demo rehearsal end-to-end

## 13. Testing Strategy

Minimal but real, not exhaustive:
- Backend: a handful of route-level tests per resource (happy path + one auth-failure case) using `supertest` — enough to catch regressions, not full coverage
- Frontend: skip formal test suite for the demo phase; manual click-through is fine given the timeline
- Before the demo: one deliberate run-through as a "hostile" tester — wrong password, expired token, malformed nl-create instruction — to make sure failures degrade gracefully instead of crashing

## 14. Explicitly Deferred to Production Phase

Listed here so it's clear these are known gaps, not oversights:
- Entra ID / SSO login
- Real data ingestion from actual Kyndryl systems, with whatever data governance that requires
- Formal security review / pen test
- Audit logging beyond basic `createdBy`/`updatedAt` fields
- Horizontal scaling, monitoring, alerting
- Multi-tenant / multi-org support if this ever goes beyond one team

## 15. Notes for Claude Code

- Build backend first, verify every route with real requests before starting frontend work — don't build against assumed API shapes.
- Write `openapi.yaml` alongside the routes, not after — it's what Copilot Studio's custom connector imports to know what actions it can call, so it needs to stay accurate as routes change.
- There is no LLM integration inside this backend — Copilot Studio owns all natural-language parsing and generation. If a task ever seems to call for adding an LLM call inside Express, stop and check against §7 first; that's very likely Copilot Studio's job, not the API's.
- Follow the security checklist in §9 as you go, not as a pass at the end — retrofitting `helmet`/rate-limiting/validation is more error-prone than building with them from the first commit.
- Match the schema in §5 exactly unless there's a concrete reason to deviate — it's already validated against the fake dataset from the earlier Power Platform prototype.
- Authenticate the Copilot Studio connector with its own key (`COPILOT_CONNECTOR_API_KEY`), separate from user JWTs — treat it as its own client, not a special case of user auth.
