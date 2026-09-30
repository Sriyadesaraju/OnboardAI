# Copilot Studio Agent — Setup Guide

This is the roadmap's **Week 2 Day 4–5** work: standing up the natural-language front door in **Microsoft Copilot Studio** that talks to the OnboardAI Express API through a custom connector.

**Division of labour:** the backend is already connector-ready — `backend/src/openapi.yaml` describes every action, and the API authenticates the agent with its own key (`COPILOT_CONNECTOR_API_KEY`, sent as the `x-connector-key` header), completely separate from human JWTs. The steps below happen inside *your* Microsoft 365 / Power Platform tenant and can only be done by you (they need a signed-in tenant with a Copilot Studio license). There is **no code to write** — Copilot Studio owns all the natural-language parsing and phrasing; the API just receives clean structured JSON.

> **You already have a working interim agent.** Until you have a Copilot Studio subscription, the app ships a local rule-based assistant (the floating **Assistant** widget) that does the same job with no key and no cost — see [AGENT.md](AGENT.md). Its intents were written to map 1:1 to the topics below, so moving to Copilot Studio is a re-implementation of the same intents against the same endpoints, not a redesign.

---

## 0. Prerequisites

| Need | Notes |
|---|---|
| Microsoft 365 tenant with **Copilot Studio** access | A trial works: https://copilotstudio.microsoft.com |
| The API reachable over **public HTTPS** | Copilot Studio is cloud-hosted and cannot reach `localhost`. Deploy the backend first (see §1). |
| The value of `COPILOT_CONNECTOR_API_KEY` | From `backend/.env`. This is the key the connector will present. Treat it as a secret. |

---

## 1. Deploy the backend so Copilot Studio can reach it

Deploy `backend/` to any host that gives you an HTTPS URL (the roadmap suggests **Render** or **Railway** free tier). Set the same environment variables as local, with:

- `DATABASE_URL` → your hosted Postgres (Supabase/Neon).
- `COPILOT_CONNECTOR_API_KEY` → keep/rotate a strong value; you'll paste it into the connector.
- `ALLOWED_ORIGINS` → your deployed frontend origin (this only affects browser CORS; the connector is server-to-server and is **not** subject to CORS).

Confirm it's live:

```bash
curl https://<your-api-host>/health          # -> {"status":"ok"}
curl -H "x-connector-key: <KEY>" https://<your-api-host>/api/trainees   # -> array of trainees
```

The second call proves the connector-key auth path works from outside — that's exactly what Copilot Studio will do.

Then edit the top of `backend/src/openapi.yaml` so the `servers:` URL points at your deployed host instead of `http://localhost:3000/api`:

```yaml
servers:
  - url: https://<your-api-host>/api
```

---

## 2. Create the custom connector from `openapi.yaml`

You have two paths depending on which importer your tenant surfaces. Both end up in the same place.

### Path A — Power Platform custom connector (classic)
1. Go to https://make.powerapps.com → **More** → **Discover all** → **Custom connectors** (or **Data → Custom connectors**).
2. **New custom connector → Import an OpenAPI file** and upload `backend/src/openapi.yaml`.
   - If the importer rejects OpenAPI 3.0 (some tenants' classic importer only accepts Swagger 2.0), convert it once with a tool like `api-spec-converter` or the Swagger Editor's "Convert to Swagger 2.0", then import the result. The action shapes stay identical.
3. On the **Security** tab, choose **API Key**:
   - Parameter label: `Connector key`
   - Parameter name: `x-connector-key`
   - Location: **Header**
4. **Create connector.** On the **Test** tab, create a connection, paste the `COPILOT_CONNECTOR_API_KEY` value, and test `listTrainees` — you should get the trainee list back.

### Path B — Add it straight inside Copilot Studio (newer experience)
1. In Copilot Studio, open your agent → **Tools/Actions → Add a tool → New tool → Custom connector**; this drops you into the same Power Platform flow as Path A.
2. Or **Add an action → Connector → New custom connector → Import from OpenAPI**, then set the API-key security exactly as in Path A step 3.

The connector now exposes these operations (from the OpenAPI `operationId`s):

| operationId | Method + path | Used for |
|---|---|---|
| `createTask` | POST `/tasks` | Create a task for one / a list / **all** trainees |
| `listTrainees` | GET `/trainees` | Resolve names → ids |
| `listTasks` | GET `/tasks` | Look up existing tasks |
| `getWeeklySummary` | GET `/reports/weekly-summary` | Stats for the summary |
| `getRiskFlags` | GET `/reports/risk-flags` | At-risk trainees |
| `recordAttendance` | POST `/attendance` | Mark attendance |

---

## 3. Create the agent

1. Copilot Studio → **Create → New agent**. Name it e.g. **OnboardAI Assistant**.
2. Give it instructions describing its job, for example:

   > You help managers manage trainee onboarding. You can create tasks, give a weekly progress summary, and report which trainees are at risk. When the user asks to create tasks, extract the task name, due date, priority, and who it's for. If they say "everyone" / "all trainees" / "the whole batch," set `assignToAll` to true. Otherwise resolve the trainee by name using `listTrainees` and pass their `id` as `traineeId`. Always confirm the parsed details back to the user before creating. Never invent numbers — for summaries and risk, call the action and read back the values it returns.

---

## 4. Add the three actions (topics)

For each, add the connector operation as an action and let the agent's generative orchestration fill the inputs from the conversation.

### 4a. "Create onboarding tasks" → `createTask`
- Input mapping (all from the conversation):
  - `taskName` ← the task the manager named
  - `dueDate` ← the date they gave (ISO 8601)
  - `priority` ← `LOW` / `MEDIUM` / `HIGH` (default `MEDIUM`)
  - **exactly one target:**
    - `assignToAll: true` when they say everyone / all / whole batch, **or**
    - `traineeId` ← resolved via `listTrainees` when they name a person.
- The API returns `{ "created": <n> }`; have the agent reply e.g. *"Created 'Security Course' for all 16 trainees, due July 18."*
- Example utterances to train on:
  - "Create a task Security Course for everyone, due July 18, high priority"
  - "Assign AI Training to Priya Nair due next Friday"

### 4b. "Weekly summary" → `getWeeklySummary`
- No inputs. The action returns `completionRatePercent`, `overdueTaskCount`, `attendanceRatePercent`, etc.
- The agent phrases the numbers conversationally — *"This week: 27% of tasks complete, 30 overdue, attendance at 88%."* The wording is Copilot Studio's; the numbers are the API's.

### 4c. "Risk flags" → `getRiskFlags`
- No inputs. Returns an array of flagged trainees with a `reasons` list each.
- The agent writes one line per trainee — *"Rahul Verma is at risk: 3 overdue tasks and attendance at 78%."*

*(Optional 4d: "Mark attendance" → `recordAttendance`, if you want the agent to record attendance too.)*

---

## 5. Test in the Copilot Studio test pane

Use the built-in test chat and run the roadmap's §13 "hostile tester" pass:

- ✅ "Give everyone the Policy Acknowledgement task due Aug 30" → one `createTask` call with `assignToAll: true`.
- ✅ "How's the batch doing this week?" → `getWeeklySummary`, phrased.
- ✅ "Who's falling behind?" → `getRiskFlags`, phrased per trainee.
- ⚠️ Malformed instruction ("make a task") → the agent should ask for the missing details (name / date / who) instead of calling the action with garbage.

---

## 6. (Optional) Embed the agent in the React app

Copilot Studio → **Channels → Custom website** gives you an embed snippet. Drop it into the React app (e.g. a floating chat panel) so managers get the NL surface and the dashboards in one place. This is cosmetic — the agent already works standalone in Teams / the demo website channel.

---

## Security recap (roadmap §11)

- The agent authenticates with **its own key** (`x-connector-key`), never a human's JWT — so you can scope, rotate, or revoke the agent's access independently, and every agent-created record is stamped `createdBy: "copilot-connector"` for the audit trail.
- Rotate the key by updating `COPILOT_CONNECTOR_API_KEY` on the host **and** the connection's API-key value in Power Platform — nothing else changes.
- The API validates every field with the same Zod schemas regardless of whether a request came from the React form or the agent, so the agent can't smuggle in malformed data.
