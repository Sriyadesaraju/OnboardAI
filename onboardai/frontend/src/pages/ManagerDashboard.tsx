import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Task, Trainee, WeeklySummary, RiskFlag } from "../lib/types";
import Header from "../components/Header";
import CreateTaskForm from "../components/CreateTaskForm";
import TraineeRoster from "../components/TraineeRoster";
import AgentChat from "../components/AgentChat";
import { useAuth } from "../lib/auth";
import { useRefetchOnFocus } from "../lib/useRefetchOnFocus";
import { Card, PriorityBadge, StatCard, StatusBadge } from "../components/ui";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const canCreateTasks = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [risks, setRisks] = useState<RiskFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, ts, sm, rk] = await Promise.all([
        api.get<Trainee[]>("/trainees"),
        api.get<Task[]>("/tasks"),
        api.get<WeeklySummary>("/reports/weekly-summary"),
        api.get<RiskFlag[]>("/reports/risk-flags"),
      ]);
      setTrainees(t);
      setTasks(ts);
      setSummary(sm);
      setRisks(rk);
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

  const traineeName = useMemo(() => {
    const map = new Map(trainees.map((t) => [t.id, t.name]));
    return (id: string, fallback?: { name: string }) => map.get(id) ?? fallback?.name ?? id;
  }, [trainees]);

  const filteredTasks = useMemo(
    () => (statusFilter ? tasks.filter((t) => t.status === statusFilter) : tasks),
    [tasks, statusFilter]
  );

  return (
    <div className="min-h-screen">
      <Header subtitle="Manager dashboard" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {error && <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Trainees" value={String(trainees.length)} />
          <StatCard
            label="Completion rate"
            value={summary ? `${summary.completionRatePercent}%` : "—"}
            hint={summary ? `${summary.totalTasks} tasks total` : undefined}
          />
          <StatCard label="Overdue tasks" value={summary ? String(summary.overdueTaskCount) : "—"} />
          <StatCard
            label="Attendance"
            value={summary ? `${summary.attendanceRatePercent}%` : "—"}
            hint={summary ? `${summary.totalAttendanceRecords} records` : undefined}
          />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {canCreateTasks && (
              <CreateTaskForm trainees={trainees} onCreated={loadAll} allTargetLabel="all trainees" />
            )}

            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              {loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : filteredTasks.length === 0 ? (
                <p className="text-sm text-slate-400">No tasks match this filter.</p>
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
                      {filteredTasks.map((task) => (
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
          </div>

          <div className="space-y-6">
            <TraineeRoster trainees={trainees} title="Trainees" showSpoc />
            <Card>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">At-risk trainees</h2>
              {loading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : risks.length === 0 ? (
                <p className="text-sm text-slate-400">No trainees flagged. 🎉</p>
              ) : (
                <ul className="space-y-3">
                  {risks.map((r) => (
                    <li key={r.traineeId} className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
                      <p className="font-medium text-slate-800">
                        {r.name} <span className="text-xs text-slate-400">#{r.traineeNumericId}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.batch} · SPOC {r.spoc ?? "—"}
                      </p>
                      <ul className="mt-1 list-inside list-disc text-xs text-rose-700">
                        {r.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </main>
      <AgentChat />
    </div>
  );
}
