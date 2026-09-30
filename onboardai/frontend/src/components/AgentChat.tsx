import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";

interface Message {
  from: "user" | "agent";
  text: string;
}

const SUGGESTIONS = [
  "How are we doing this week?",
  "Who is at risk?",
  "List my trainees",
];

const GREETING: Message = {
  from: "agent",
  text:
    "Hi! I'm the OnboardAI assistant. Try:\n" +
    '• "Create task Security Course for everyone due August 15, high priority"\n' +
    '• "How are we doing this week?"\n' +
    '• "Who is at risk?"\n' +
    '• "How is Priya Nair doing?"',
};

// Floating chat widget — the interim natural-language front door. It only calls
// POST /agent/message with the logged-in user's session, so it inherits their
// scope. This is the surface that a Copilot Studio agent replaces later.
export default function AgentChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setMessages((m) => [...m, { from: "user", text: trimmed }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api.post<{ reply: string }>("/agent/message", { message: trimmed });
      setMessages((m) => [...m, { from: "agent", text: res.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { from: "agent", text: err instanceof ApiError ? `⚠️ ${err.message}` : "⚠️ Couldn't reach the assistant." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-slate-700"
      >
        <span aria-hidden>💬</span> Assistant
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">OnboardAI Assistant</p>
          <p className="text-[10px] text-slate-300">Natural-language actions</p>
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.from === "user"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">Assistant is thinking…</div>}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-2">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask or instruct…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
