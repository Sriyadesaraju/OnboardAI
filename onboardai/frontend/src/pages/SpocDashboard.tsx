import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Task, Trainee } from "../lib/types";
import Header from "../components/Header";
import MyTaskList from "../components/MyTaskList";
import CreateTaskForm from "../components/CreateTaskForm";
import AttendanceForm from "../components/AttendanceForm";
import TraineeRoster from "../components/TraineeRoster";
import AgentChat from "../components/AgentChat";
import { useRefetchOnFocus } from "../lib/useRefetchOnFocus";
import { Card, PriorityBadge, StatCard, StatusBadge } from "../components/ui";

export default function SpocDashboard() {
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [supervised, setSupervised] = useState<Trainee[]>([]);
  const [supervisedTasks, setSupervisedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [mine, trainees, tasks] = await Promise.all([
        api.get<Task[]>("/tasks/mine"),
        api.get<Trainee[]>("/trainees"),
        api.get<Task[]>("/tasks"),
      ]);
      setMyTasks(mine);
      setSupervised(trainees);
      setSupervisedTasks(tasks);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useRefetchOnFocus(loadAll);

  async function markComplete(id: string) {
    setCompletingId(id);
    try {
      const updated = await api.patch<Task>(`/tasks/${id}/complete`);
      setMyTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update task");
    } finally {
      setCompletingId(null);
    }
  }

  const traineeName = useMemo(() => {
    const map = new Map(supervised.map((t) => [t.id, t.name]));
    return (id: string, fallback?: { name: string }) => map.get(id) ?? fallback?.name ?? id;
  }, [supervised]);

  const groupStats = useMemo(() => {
    const total = supervisedTasks.length;
    const completed = supervisedTasks.filter((t) => t.status === "COMPLETED").length;
    const overdue = supervisedTasks.filter(
      (t) => t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()
    ).length;
    return { total, completed, overdue };
  }, [supervisedTasks]);

  return (
    <div className="min-h-screen">
      <Header subtitle="SPOC dashboard" />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        {/* ---- My own onboarding (SPOC is a trainee too) ---- */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">My onboarding</h2>
          <Card>
            <MyTaskList
              tasks={myTasks}
              loading={loading}
              completingId={completingId}
              onComplete={markComplete}
              emptyText="You have no tasks assigned to you."
            />
          </Card>
        </section>

        {/* ---- My allocated trainees ---- */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">
            My trainees{" "}
            <span className="text-sm font-normal text-slate-400">({supervised.length} allocated)</span>
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Group tasks" value={String(groupStats.total)} />
            <StatCard label="Completed" value={String(groupStats.completed)} />
            <StatCard label="Overdue" value={String(groupStats.overdue)} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CreateTaskForm trainees={supervised} onCreated={loadAll} allTargetLabel="all trainees" />
            <AttendanceForm trainees={supervised} />
          </div>

          <TraineeRoster trainees={supervised} title="Allocated trainees" />

          <Card>
            <h3 className="mb-4 text-base font-semibold text-slate-900">Allocated trainees' tasks</h3>
            {loading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : supervisedTasks.length === 0 ? (
              <p className="text-sm text-slate-400">No tasks for your allocated trainees yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="pb-2 pr-4">Task</th>
                      <th className="pb-2 pr-4">Trainee</th>
                      <th className="pb-2 pr-4">Due</th>
                      <th className="pb-2 pr-4">Priority</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supervisedTasks.map((task) => (
                      <tr key={task.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 font-medium text-slate-800">{task.taskName}</td>
                        <td className="py-2 pr-4 text-slate-600">
                          {traineeName(task.traineeId, task.assignedTo)}
                        </td>
                        <td className="py-2 pr-4 text-slate-600">
                          {new Date(task.dueDate).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4">
                          <PriorityBadge priority={task.priority} />
                        </td>
                        <td className="py-2">
                          <StatusBadge status={task.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </main>
      <AgentChat />
    </div>
  );
}
