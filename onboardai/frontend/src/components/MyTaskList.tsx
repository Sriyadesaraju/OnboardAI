import type { Task } from "../lib/types";
import { Button, PriorityBadge, StatusBadge } from "./ui";

interface Props {
  tasks: Task[];
  loading: boolean;
  completingId: string | null;
  onComplete: (id: string) => void;
  emptyText?: string;
}

// The trainee-style "my tasks" list with a mark-complete action. Shared by the
// Trainee dashboard and the SPOC dashboard (SPOCs are trainees too).
export default function MyTaskList({
  tasks,
  loading,
  completingId,
  onComplete,
  emptyText = "You have no assigned tasks yet.",
}: Props) {
  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (tasks.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>;

  return (
    <ul className="space-y-3">
      {tasks.map((task) => {
        const overdue = task.status !== "COMPLETED" && new Date(task.dueDate) < new Date();
        return (
          <li
            key={task.id}
            className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-800">{task.taskName}</p>
                <PriorityBadge priority={task.priority} />
                <StatusBadge status={task.status} />
              </div>
              {task.description && <p className="mt-1 text-sm text-slate-500">{task.description}</p>}
              <p className={`mt-1 text-xs ${overdue ? "text-rose-600" : "text-slate-400"}`}>
                Due {new Date(task.dueDate).toLocaleDateString()}
                {overdue ? " · overdue" : ""}
              </p>
            </div>
            {task.status !== "COMPLETED" && (
              <Button
                onClick={() => onComplete(task.id)}
                disabled={completingId === task.id}
                className="shrink-0"
              >
                {completingId === task.id ? "Saving…" : "Mark complete"}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
