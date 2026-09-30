import { FormEvent, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Trainee, AttendanceStatusValue } from "../lib/types";
import { Button, Card } from "./ui";

// Lets a SPOC record attendance for one of their allocated trainees.
export default function AttendanceForm({ trainees }: { trainees: Trainee[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [traineeId, setTraineeId] = useState("");
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<AttendanceStatusValue>("PRESENT");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!traineeId) {
      setError("Select a trainee.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/attendance", { traineeId, date: new Date(date).toISOString(), status });
      const name = trainees.find((t) => t.id === traineeId)?.name ?? "trainee";
      setMessage(`Marked ${name} ${status.toLowerCase()} on ${date}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to record attendance");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Mark attendance</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500">Trainee</label>
          <select
            value={traineeId}
            onChange={(e) => setTraineeId(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {trainees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (#{t.traineeId})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AttendanceStatusValue)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Saving…" : "Record attendance"}
          </Button>
        </div>
        {(message || error) && (
          <p className={`sm:col-span-2 text-sm ${error ? "text-rose-700" : "text-emerald-700"}`}>
            {error ?? message}
          </p>
        )}
      </form>
    </Card>
  );
}
