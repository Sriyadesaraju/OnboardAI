import { Router, Request } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { UserRole } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { parseIntent } from "../lib/agentParser";

const router = Router();

// This interim agent is a THIN front door: it never touches Prisma or the
// business logic directly. It only calls the same REST endpoints everything
// else uses, forwarding the caller's own credentials — so a SPOC's requests are
// automatically scoped to their group by the exact same rules. Replicating this
// in Copilot Studio later is 1:1: the same calls, with the connector key instead
// of the user's JWT. Nothing in the core API changes.
const API_BASE = `http://127.0.0.1:${process.env.PORT ?? 3000}/api`;

const agentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);
router.use(requireRole(UserRole.MANAGER, UserRole.ADMIN, UserRole.SPOC));
router.use(agentRateLimit);

interface Trainee {
  id: string;
  traineeId: number;
  name: string;
  batch: string;
  spoc: string | null;
}

// Forward whichever credential the caller used to the internal REST call.
function forwardedAuth(req: Request): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = req.header("authorization");
  const connector = req.header("x-connector-key");
  if (auth) headers.authorization = auth;
  if (connector) headers["x-connector-key"] = connector;
  return headers;
}

async function apiCall<T>(
  req: Request,
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: forwardedAuth(req),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

function matchTrainee(trainees: Trainee[], query: string): Trainee[] {
  const q = query.toLowerCase().trim();
  const exact = trainees.filter((t) => t.name.toLowerCase() === q || String(t.traineeId) === q);
  if (exact.length) return exact;
  return trainees.filter((t) => t.name.toLowerCase().includes(q));
}

const messageSchema = z.object({ message: z.string().min(1).max(500) });

router.post("/message", validate(messageSchema), async (req, res) => {
  const { message } = req.body as z.infer<typeof messageSchema>;
  const intent = parseIntent(message);

  try {
    switch (intent.kind) {
      case "weekly_summary": {
        const { data } = await apiCall<{
          completionRatePercent: number;
          overdueTaskCount: number;
          attendanceRatePercent: number;
          totalTasks: number;
        }>(req, "GET", "/reports/weekly-summary");
        const scope = req.user!.role === UserRole.SPOC ? "your group" : "the programme";
        return res.json({
          intent: intent.kind,
          data,
          reply: `📊 Weekly summary for ${scope}: ${data.completionRatePercent}% of ${data.totalTasks} tasks complete, ${data.overdueTaskCount} overdue, attendance at ${data.attendanceRatePercent}%.`,
        });
      }

      case "risk_flags": {
        const { data } = await apiCall<
          Array<{ name: string; reasons: string[] }>
        >(req, "GET", "/reports/risk-flags");
        if (!data.length) {
          return res.json({ intent: intent.kind, data, reply: "✅ No trainees are currently flagged as at risk." });
        }
        const lines = data.map((r) => `• ${r.name} — ${r.reasons.join("; ")}`);
        return res.json({
          intent: intent.kind,
          data,
          reply: `⚠️ ${data.length} trainee${data.length > 1 ? "s" : ""} at risk:\n${lines.join("\n")}`,
        });
      }

      case "list_trainees": {
        const { data: trainees } = await apiCall<Trainee[]>(req, "GET", "/trainees");
        if (!trainees.length) return res.json({ intent: intent.kind, data: trainees, reply: "You have no allocated trainees." });
        const lines = trainees.map((t) => `• ${t.name} (#${t.traineeId}, ${t.batch})`);
        return res.json({
          intent: intent.kind,
          data: trainees,
          reply: `You have ${trainees.length} trainee${trainees.length > 1 ? "s" : ""}:\n${lines.join("\n")}`,
        });
      }

      case "trainee_detail": {
        const { data: trainees } = await apiCall<Trainee[]>(req, "GET", "/trainees");
        const matches = matchTrainee(trainees, intent.traineeQuery);
        if (matches.length === 0) {
          return res.json({ intent: intent.kind, reply: `I couldn't find a trainee matching "${intent.traineeQuery}" in your list.` });
        }
        if (matches.length > 1) {
          return res.json({
            intent: intent.kind,
            reply: `That matches several trainees: ${matches.map((t) => t.name).join(", ")}. Which one?`,
          });
        }
        const { data: detail } = await apiCall<{
          name: string;
          batch: string;
          status: string;
          tasks: Array<{ status: string; dueDate: string }>;
          attendance: Array<{ status: string }>;
        }>(req, "GET", `/trainees/${matches[0].id}/detail`);
        const total = detail.tasks.length;
        const done = detail.tasks.filter((t) => t.status === "COMPLETED").length;
        const overdue = detail.tasks.filter(
          (t) => t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()
        ).length;
        const present = detail.attendance.filter((a) => a.status === "PRESENT").length;
        const attRate = detail.attendance.length
          ? Math.round((present / detail.attendance.length) * 1000) / 10
          : 100;
        return res.json({
          intent: intent.kind,
          data: detail,
          reply: `👤 ${detail.name} (${detail.batch}, ${detail.status}): ${done}/${total} tasks done, ${overdue} overdue, attendance ${attRate}%.`,
        });
      }

      case "create_task": {
        if (!intent.taskName) {
          return res.json({ intent: intent.kind, reply: 'What should the task be called? e.g. "Create task Security Course for everyone due August 15".' });
        }
        if (!intent.dueDate) {
          return res.json({ intent: intent.kind, reply: `What's the due date for "${intent.taskName}"? e.g. "due August 15".` });
        }

        let target: Record<string, unknown>;
        let who: string;
        if (intent.assignToAll) {
          target = { assignToAll: true };
          who = "all trainees";
        } else if (intent.traineeQuery) {
          const { data: trainees } = await apiCall<Trainee[]>(req, "GET", "/trainees");
          const matches = matchTrainee(trainees, intent.traineeQuery);
          if (matches.length === 0) {
            return res.json({ intent: intent.kind, reply: `I couldn't find "${intent.traineeQuery}" in your trainees. Try their full name, or say "for everyone".` });
          }
          if (matches.length > 1) {
            return res.json({ intent: intent.kind, reply: `"${intent.traineeQuery}" matches ${matches.map((t) => t.name).join(", ")}. Who did you mean?` });
          }
          target = { traineeId: matches[0].id };
          who = matches[0].name;
        } else {
          return res.json({ intent: intent.kind, reply: `Who should "${intent.taskName}" go to? Name a trainee, or say "for everyone".` });
        }

        const { ok, data } = await apiCall<{ created: number }>(req, "POST", "/tasks", {
          taskName: intent.taskName,
          dueDate: new Date(intent.dueDate).toISOString(),
          priority: intent.priority ?? undefined,
          ...target,
        });
        if (!ok) {
          return res.json({ intent: intent.kind, reply: "Sorry, I couldn't create that task. Please check the details and try again." });
        }
        const pri = intent.priority ? `, ${intent.priority.toLowerCase()} priority` : "";
        return res.json({
          intent: intent.kind,
          data,
          reply: `✅ Created "${intent.taskName}" for ${who} (${data.created} task${data.created > 1 ? "s" : ""}), due ${intent.dueDate}${pri}.`,
        });
      }

      case "help":
      default:
        return res.json({
          intent: "help",
          reply:
            "I can help with:\n" +
            '• Create tasks — "Create task Security Course for everyone due August 15, high priority"\n' +
            '• Weekly summary — "How are we doing this week?"\n' +
            '• At-risk trainees — "Who is at risk?"\n' +
            '• Trainee details — "How is Priya Nair doing?"\n' +
            '• Your trainees — "List my trainees"',
        });
    }
  } catch (err) {
    console.error("Agent error:", err);
    return res.status(500).json({ intent: "error", reply: "Something went wrong handling that. Please try again." });
  }
});

export default router;
