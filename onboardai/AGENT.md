# Interim Assistant — how it works & how it maps to Copilot Studio

The **Assistant** widget on the Manager and SPOC dashboards is a local, rule-based natural-language front door. It exists so the demo has the conversational experience **now**, without an M365/Copilot Studio subscription. It's built to be replaced by a Copilot Studio agent later with **no change to the core API**.

## Design (why it's a drop-in replacement for Copilot Studio)

```
React <AgentChat/>  ──POST /api/agent/message (user's JWT)──▶  routes/agent.ts
                                                                    │
                                          parseIntent()  ── lib/agentParser.ts (pure, no I/O)
                                                                    │
                                     calls the SAME REST endpoints over HTTP, forwarding
                                     the caller's own credentials (so SPOC scope applies)
                                                                    ▼
                                        /tasks · /trainees · /reports · /trainees/:id/detail
```

Two properties make the later swap trivial:

1. **The agent never touches the database or business logic.** `routes/agent.ts` imports no Prisma — it only makes HTTP calls to the same endpoints the React app and (future) Copilot Studio connector use. Deleting the agent module removes the interim brain and changes nothing else.
2. **It authenticates as the caller.** The widget sends the logged-in user's JWT; the agent forwards it. So a SPOC asking "how are we doing?" gets *their group's* numbers, enforced by the exact same backend rules — no special-casing.

When you move to Copilot Studio (see [COPILOT_STUDIO_SETUP.md](COPILOT_STUDIO_SETUP.md)), you recreate these same intents as **topics**, each calling the same endpoint via the custom connector (authenticated with `COPILOT_CONNECTOR_API_KEY` instead of a user JWT). The `lib/agentParser.ts` intents were written to line up 1:1 with those topics.

## Intent → endpoint → Copilot Studio topic

| Say something like… | Intent | Calls | Copilot Studio topic (later) |
|---|---|---|---|
| "Create task Security Course for everyone due August 15, high priority" | `create_task` (assignToAll) | `POST /tasks` `{assignToAll:true}` | "Create onboarding tasks" → `createTask` |
| "Assign AI Training to Priya Nair due 2026-08-01" | `create_task` (single) | `GET /trainees` → `POST /tasks` `{traineeId}` | same topic, resolves name via `listTrainees` |
| "How are we doing this week?" | `weekly_summary` | `GET /reports/weekly-summary` | "Weekly summary" → `getWeeklySummary` |
| "Who is at risk?" | `risk_flags` | `GET /reports/risk-flags` | "Risk flags" → `getRiskFlags` |
| "How is Priya Nair doing?" | `trainee_detail` | `GET /trainees` → `GET /trainees/:id/detail` | "Trainee status" → `getTrainee` + detail |
| "List my trainees" | `list_trainees` | `GET /trainees` | "List trainees" → `listTrainees` |
| anything else | `help` | — | fallback / system topic |

## What the rule-based parser handles

- **Task name**: quoted (`"Intro to Security"`), `called/named X`, `task X`, or the text after the verb up to a boundary word (`for`/`to`/`due`/`by`/`with`/`priority`). Quote the name if it contains one of those words.
- **Target**: "everyone / all / whole batch" → assign to all; otherwise "for/to `<name>`" resolved against the caller's trainee list (case-insensitive, supports partial + `#id`). Ambiguous or unknown names → the agent asks.
- **Due date**: ISO (`2026-08-15`), "August 15" / "15 August" (year optional, defaults to current year), "today", "tomorrow", "in N days".
- **Priority**: high / medium / low.
- **Missing info** (no name or no date) → the agent asks a follow-up instead of guessing.

## Limits (acceptable for the interim demo)

- Deterministic phrasing, not generative — it won't handle arbitrary paraphrases the way Copilot Studio's LLM will. It covers the demo intents above.
- A task name containing a boundary word (e.g. "Intro **to** Security") should be quoted.
- No multi-turn slot-filling memory beyond a single follow-up prompt.

`lib/agentParser.ts` is pure and dependency-free, so these rules are easy to extend or unit-test.
