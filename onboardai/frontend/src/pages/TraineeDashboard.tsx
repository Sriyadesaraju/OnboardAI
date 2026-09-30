import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Task } from "../lib/types";
import Header from "../components/Header";
import MyTaskList from "../components/MyTaskList";
import { useRefetchOnFocus } from "../lib/useRefetchOnFocus";
import { Card, StatCard } from "../components/ui";

export default function TraineeDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Task[]>("/tasks/mine");
      setTasks(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load your tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // A task the manager just assigned to everyone shows up when this tab refocuses.
  useRefetchOnFocus(loadTasks);

  async function markComplete(id: string) {
    setCompletingId(id);
    try {
      const updated = await api.patch<Task>(`/tasks/${id}/complete`);
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update task");
    } finally {
      setCompletingId(null);
    }
  }

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const overdue = tasks.filter(
      (t) => t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()
    ).length;
    return { total, completed, overdue };
  }, [tasks]);

  return (
    <div className="min-h-screen">
      <Header subtitle="My onboarding" />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total tasks" value={String(stats.total)} />
          <StatCard label="Completed" value={String(stats.completed)} />
          <StatCard label="Overdue" value={String(stats.overdue)} />
        </section>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">My tasks</h2>
          <MyTaskList
            tasks={tasks}
            loading={loading}
            completingId={completingId}
            onComplete={markComplete}
          />
        </Card>
      </main>
    </div>
  );
}
