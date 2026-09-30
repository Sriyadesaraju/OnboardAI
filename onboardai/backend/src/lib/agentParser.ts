// Pure, dependency-free natural-language parser for the interim agent.
//
// This deliberately mirrors what a Copilot Studio agent's generative layer
// would extract, so the intents map 1:1 to Copilot Studio topics later. It does
// no I/O — it only turns a sentence into a structured intent. routes/agent.ts
// takes that intent and calls the existing REST API to actually do the work.

export type AgentIntent =
  | { kind: "create_task"; taskName: string | null; assignToAll: boolean; traineeQuery: string | null; dueDate: string | null; priority: "LOW" | "MEDIUM" | "HIGH" | null }
  | { kind: "weekly_summary" }
  | { kind: "risk_flags" }
  | { kind: "list_trainees" }
  | { kind: "trainee_detail"; traineeQuery: string }
  | { kind: "help" };

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8,
  sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

// Parse a natural due date into ISO yyyy-mm-dd, or null if not understood.
// Supports: ISO (2026-08-15), "August 15" / "15 August" [year optional],
// "today", "tomorrow", "in N days". Defaults the year to the current year.
export function parseNaturalDate(input: string, now = new Date()): string | null {
  const text = input.trim().toLowerCase();

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  if (/\btoday\b/.test(text)) return toIso(now);
  if (/\btomorrow\b/.test(text)) return toIso(addDays(now, 1));

  const inDays = text.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) return toIso(addDays(now, parseInt(inDays[1], 10)));

  const monthNames = Object.keys(MONTHS).join("|");
  // "August 15" or "August 15, 2026"
  let m = text.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`));
  if (m) return buildDate(MONTHS[m[1]], parseInt(m[2], 10), m[3], now);
  // "15 August" or "15 August 2026"
  m = text.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{4}))?`));
  if (m) return buildDate(MONTHS[m[2]], parseInt(m[1], 10), m[3], now);

  return null;
}

function buildDate(month: number, day: number, year: string | undefined, now: Date): string {
  const y = year ? parseInt(year, 10) : now.getUTCFullYear();
  return toIso(new Date(Date.UTC(y, month, day)));
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parsePriority(text: string): "LOW" | "MEDIUM" | "HIGH" | null {
  const m = text.match(/\b(high|medium|low)\b(?:\s+priority)?/i) || text.match(/priority\s+(high|medium|low)/i);
  if (!m) return null;
  return m[1].toUpperCase() as "LOW" | "MEDIUM" | "HIGH";
}

// Everyone / all trainees / the whole batch.
function mentionsEveryone(text: string): boolean {
  return /\b(everyone|every trainee|all trainees|all of them|whole batch|entire batch|the batch|all\b)/i.test(text);
}

// Words that never constitute a real task name on their own.
const NAME_STOPWORDS = new Set(["task", "a", "an", "the", "to", "for", "it", ""]);

// Boundary keywords that end a task name (assignment target / metadata clauses).
const NAME_BOUNDARY = /\s+\b(?:for|to|due|by|with|priority)\b/i;

// Pull the task name out of a create instruction.
function extractTaskName(original: string): string | null {
  // Quoted name wins (also the way to keep a name that contains "to"/"for").
  const quoted = original.match(/["'“”‘’](.+?)["'“”‘’]/);
  if (quoted) return validName(quoted[1]);

  // "called X" / "named X" up to a boundary keyword.
  const named = original.match(/\b(?:called|named|titled)\s+(.+?)(?:\s+\b(?:for|to|due|by|with|priority)\b|$)/i);
  if (named) return validName(named[1]);

  // Between "task" and the first boundary keyword.
  const afterTask = original.match(/\btask\s+(.+?)(?:\s+\b(?:for|to|due|by|with|priority)\b|$)/i);
  if (afterTask) return validName(afterTask[1]);

  // Fallback: strip the leading verb (and a trailing "task"), then cut at the
  // first boundary keyword.
  const stripped = original.replace(
    /^\s*(?:please\s+)?(?:create|add|assign|make|set up|give|schedule|new)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:task\b\s*)?/i,
    ""
  );
  return validName(stripped.split(NAME_BOUNDARY)[0]);
}

function cleanName(s: string): string {
  return s.replace(/[.,;:]+$/, "").trim();
}

function validName(s: string): string | null {
  const name = cleanName(s);
  return NAME_STOPWORDS.has(name.toLowerCase()) ? null : name || null;
}

// The trainee a query is about: "for Priya Nair", "to Priya Nair".
function extractTraineeQuery(original: string): string | null {
  const m = original.match(/\b(?:for|to)\s+(.+?)(?:\s+\b(?:due|by|with|priority)\b|$)/i);
  if (m) {
    const q = cleanName(m[1]);
    return NAME_STOPWORDS.has(q.toLowerCase()) ? null : q || null;
  }
  return null;
}

export function parseIntent(message: string): AgentIntent {
  const text = message.toLowerCase().trim();

  // Reports first — these are unambiguous keyword intents.
  if (/\b(weekly\s+summary|summary|how are we doing|how.s it going|progress|overview|stats)\b/.test(text)) {
    return { kind: "weekly_summary" };
  }
  if (/\b(risk|at[-\s]?risk|falling behind|flags?|flagged|behind|concern)\b/.test(text)) {
    return { kind: "risk_flags" };
  }

  // Create task. Triggered by a create/assign verb together with either the
  // word "task" or an assignment clause ("for everyone", "to Priya", ...).
  const hasCreateVerb = /\b(create|add|assign|make|set up|give|schedule|new)\b/.test(text);
  const hasTaskTarget = /\btask\b/.test(text) || /\b(for|to)\s+\S/.test(text);
  if (hasCreateVerb && hasTaskTarget) {
    const assignToAll = mentionsEveryone(text);
    return {
      kind: "create_task",
      taskName: extractTaskName(message),
      assignToAll,
      traineeQuery: assignToAll ? null : extractTraineeQuery(message),
      dueDate: parseNaturalDate(message),
      priority: parsePriority(message),
    };
  }

  // List my trainees.
  if (/\b(list|show|who).*(trainees?|supervise|allocated|my (people|group|team))\b/.test(text) || /\bmy trainees\b/.test(text)) {
    return { kind: "list_trainees" };
  }

  // Trainee detail: "show <name>", "how is <name> doing", "<name>'s tasks/attendance".
  const detail =
    message.match(/\b(?:show|view|open|how is|how's|status of|details? (?:for|of)|tell me about)\s+(.+?)(?:\s+(?:doing|tasks?|attendance|status|details?))?\??$/i) ||
    message.match(/\b(.+?)'s\s+(?:tasks?|attendance|status|details?)\b/i);
  if (detail && detail[1]) {
    const q = cleanName(detail[1]);
    if (q && !/^\s*(me|my|the|a|an)\s*$/i.test(q)) {
      return { kind: "trainee_detail", traineeQuery: q };
    }
  }

  return { kind: "help" };
}
