# OnboardAI

Prototype web app that replaces spreadsheet-based trainee onboarding tracking. A manager creates trackable tasks per trainee (via a form or, later, a Copilot Studio chat agent); trainees mark tasks complete; managers/SPOCs get a live view of who's on track.

**This is a demo built on fake data only.** See [`../OnboardAI_Project_Roadmap.md`](../OnboardAI_Project_Roadmap.md) for the full spec.

## Architecture

```
React SPA (Vite)  ──HTTPS/JWT──▶  Express API  ──Prisma──▶  PostgreSQL
                                       ▲
                          x-connector-key (OpenAPI)
                                       │
                                Copilot Studio agent  (natural-language front door)
```

The React app and Copilot Studio are two front doors onto the same Express API. Copilot Studio owns all natural-language parsing/phrasing — there is **no LLM integration inside the backend**. `backend/src/openapi.yaml` is what the Copilot Studio custom connector imports.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind, React Router
- **Backend:** Node + Express + TypeScript, Zod validation, JWT auth (bcrypt), helmet, cors, express-rate-limit
- **DB/ORM:** PostgreSQL + Prisma

## Prerequisites

- Node 20+
- A running PostgreSQL instance (local Postgres, or a free Supabase/Neon database)

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env        # then fill in the values (see below)
npm install
npx prisma migrate dev --schema=src/prisma/schema.prisma   # create tables
npm run seed                # load fake trainees/tasks/attendance + demo users
npm run dev                 # starts on http://localhost:3000
```

`.env` values:

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string, e.g. `postgresql://user@localhost:5432/onboardai` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | random strings — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `COPILOT_CONNECTOR_API_KEY` | the key the Copilot Studio connector sends as `x-connector-key`, distinct from user JWTs |
| `ALLOWED_ORIGINS` | comma-separated CORS allowlist, e.g. `http://localhost:5173` |
| `PORT` | default `3000` |

### 2. Frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_BASE_URL=http://localhost:3000/api
npm install
npm run dev                 # starts on http://localhost:5173
```

## Demo accounts

All seeded accounts use the password **`Password123!`**.

| Role | Email | Lands on |
|---|---|---|
| Manager | `manager@onboardai.demo` | Manager dashboard |
| Admin | `admin@onboardai.demo` | Manager dashboard |
| SPOC | `kiran.reddy@abc.com` (also `meena.menon@abc.com`, `suresh.babu@abc.com`) | SPOC dashboard |
| Trainee | any trainee email, e.g. `priya.nair@abc.com` | Trainee dashboard |

- **Manager / Admin** → full dashboard: stats, all tasks, at-risk trainees, and a create-task form that can assign to one trainee **or all trainees at once**.
- **Trainee** → their own tasks, with mark-complete. A task assigned "to all" shows up here (the dashboard refetches when the tab regains focus).
- **SPOC** → is a trainee *plus* a supervisor. Sees **their own** onboarding tasks (mark-complete), and for the trainees allocated to them (those whose `spoc` field is the SPOC's name): their tasks + group stats, a create-task form (can assign to all trainees), and an attendance marker **scoped to their allocated group only**.

### Roles at a glance

| Capability | Trainee | SPOC | Manager / Admin |
|---|---|---|---|
| See & complete own tasks | ✅ | ✅ | — |
| See allocated trainees' tasks | — | ✅ (their group) | ✅ (everyone) |
| Drill into a trainee's full record | — | ✅ (their group) | ✅ (everyone) |
| Create tasks (incl. assign-to-all) | — | ✅ | ✅ |
| Mark attendance | — | ✅ (their group only) | ✅ (anyone) |
| Reports (summary / risk) | — | ✅ (scoped to their group) | ✅ (org-wide) |
| Natural-language assistant | — | ✅ (scoped) | ✅ |

### Trainee detail (drill-down)

From the **Trainees** roster on the Manager dashboard (or **Allocated trainees** on the SPOC dashboard), click any trainee to open `/trainees/:id` — their full record: info, task/attendance/overdue stats, the complete task list, and the full attendance history. A SPOC can only open trainees in their allocated group (the backend returns 403 otherwise).

### Assistant (interim natural-language agent)

The floating **Assistant** on the Manager and SPOC dashboards is a local, rule-based stand-in for the future Copilot Studio agent — no API key, no subscription, runs entirely on your machine. It understands: create a task (incl. "for everyone"), weekly summary, at-risk trainees, look up a trainee, and list your trainees. It's a thin front door that only calls the same REST endpoints using your logged-in session, so a SPOC's requests stay scoped to their group. See [AGENT.md](AGENT.md) for how each phrase maps to an endpoint — and to a Copilot Studio topic later.

## API surface

All routes are prefixed `/api`. Everything except `/auth/*` requires either a `Authorization: Bearer <jwt>` header (human users) or an `x-connector-key` header (the Copilot Studio connector). See `backend/src/openapi.yaml` for the machine-readable contract.

| Method | Route | Roles / scoping |
|---|---|---|
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` | — |
| GET | `/trainees` | Manager/Admin (all); SPOC (their allocated group only) |
| GET | `/trainees/:id` | Manager/Admin; SPOC (if supervised); trainee (self) |
| GET | `/trainees/:id/detail` | Same as above — trainee + all tasks + all attendance |
| POST/PATCH | `/trainees`, `/trainees/:id` | Manager, Admin |
| GET | `/tasks` | Manager/Admin (all); SPOC (their group only) |
| POST | `/tasks` | Manager, Admin, SPOC — assign via `traineeId`, `traineeIds[]`, or `assignToAll: true` |
| PATCH | `/tasks/:id` | Manager, Admin |
| GET | `/tasks/mine` | Trainee, SPOC (own tasks) |
| PATCH | `/tasks/:id/complete` | Trainee, SPOC (own task only) |
| GET/POST | `/attendance` | Manager/Admin (anyone); SPOC (their allocated group only) |
| GET | `/reports/weekly-summary`, `/reports/risk-flags` | Manager/Admin (org-wide); SPOC (scoped to their group) |
| POST | `/agent/message` | Manager, Admin, SPOC — interim NL assistant; only calls the routes above with the caller's own session |

`POST /tasks` returns `{ "created": <n> }` — one task per assigned trainee. `/reports/*` return **structured numbers only**; Copilot Studio phrases them, the backend never generates prose.

## Copilot Studio agent (natural-language front door)

The API is connector-ready (`backend/src/openapi.yaml`, authenticated by `COPILOT_CONNECTOR_API_KEY` via the `x-connector-key` header). Step-by-step instructions to build the Copilot Studio custom connector + agent are in **[COPILOT_STUDIO_SETUP.md](COPILOT_STUDIO_SETUP.md)** — those steps run in your own M365 tenant.

## Security notes (see roadmap §9)

Built in from the start: bcrypt (cost 12), short-lived access JWT + httpOnly refresh cookie, role checks in Express middleware on every protected route, Zod validation at the route boundary, Prisma-only (parameterized) DB access, helmet headers, explicit CORS allowlist, and rate limiting (tighter on `/auth/*` and the AI/report endpoints). Secrets live in `.env` (gitignored). `createdBy` is stamped on task/attendance writes as an audit stub.

## Deferred to a production phase

Entra ID / SSO, real data ingestion + governance, formal security review, full audit logging, scaling/monitoring, multi-tenant. See roadmap §14.
