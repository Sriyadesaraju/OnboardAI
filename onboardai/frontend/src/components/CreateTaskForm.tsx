import { FormEvent, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Trainee, Priority } from "../lib/types";
import { Button, Card } from "./ui";

interface Props {
  // Trainees selectable in the dropdown (manager: everyone; SPOC: supervised).
  trainees: Trainee[];
  onCreated: () => void;
  // Label for the "assign to all" toggle, e.g. "all trainees".
  allTargetLabel?: string;
}

export default function CreateTaskForm({ trainees, onCreated, allTargetLabel = "all trainees" }: Props) {
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [traineeId, setTraineeId] = useState("");
  const [assignToAll, setAssignToAll] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!assignToAll && !traineeId) {
      setError("Select a trainee, or choose “assign to all”.");
      return;
    }
    setSubmitting(true);
    try {
      const target = assignToAll ? { assignToAll: true } : { traineeId };
      const result = await api.post<{ created: number }>("/tasks", {
        taskName,
        description: description || undefined,
        dueDate: new Date(dueDate).toISOString(),
        priority,
        ...target,
      });
      setMessage(
        result.created === 1 ? "Task created." : `Task created for ${result.created} trainees.`
      );
      setTaskName("");
      setDescription("");
      setTraineeId("");
      setAssignToAll(false);
      setDueDate("");
      setPriority("MEDIUM");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Create task</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500">Task name</label>
          <input
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-500">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={assignToAll}
              onChange={(e) => setAssignToAll(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Assign to <span className="font-medium">{allTargetLabel}</span> at once
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Trainee</label>
          <select
            value={traineeId}
            onChange={(e) => setTraineeId(e.target.value)}
            disabled={assignToAll}
            required={!assignToAll}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">{assignToAll ? "— all trainees —" : "Select…"}</option>
            {trainees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (#{t.traineeId})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating…" : "Create task"}
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
