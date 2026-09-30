import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { TraineeDetail as TraineeDetailData } from "../lib/types";
import { useAuth } from "../lib/auth";
import Header from "../components/Header";
import { Card, PriorityBadge, StatCard, StatusBadge } from "../components/ui";

export default function TraineeDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TraineeDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backTo = user?.role === "SPOC" ? "/spoc" : "/manager";

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get<TraineeDetailData>(`/trainees/${id}/detail`);
        setDetail(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          setError("You don't have access to this trainee.");
        } else if (err instanceof ApiError && err.status === 404) {
          setError("Trainee not found.");
        } else {
          setError(err instanceof ApiError ? err.message : "Failed to load trainee");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const stats = useMemo(() => {
    if (!detail) return { total: 0, completed: 0, overdue: 0, attendanceRate: 0 };
    const total = detail.tasks.length;
    const completed = detail.tasks.filter((t) => t.status === "COMPLETED").length;
    const overdue = detail.tasks.filter(
      (t) => t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()
    ).length;
    const present = detail.attendance.filter((a) => a.status === "PRESENT").length;
    const attendanceRate = detail.attendance.length
      ? Math.round((present / detail.attendance.length) * 1000) / 10
      : 100;
    return { total, completed, overdue, attendanceRate };
  }, [detail]);

  return (
    <div className="min-h-screen">
      <Header subtitle="Trainee detail" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <button
          onClick={() => navigate(backTo)}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back to dashboard
        </button>

        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {error && (
          <Card>
            <p className="text-sm text-rose-700">{error}</p>
            <Link to={backTo} className="mt-2 inline-block text-sm text-slate-500 underline">
              Return to dashboard
            </Link>
          </Card>
        )}

        {detail && (
          <>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{detail.name}</h1>
                  <p className="text-sm text-slate-500">
                    #{detail.traineeId} · {detail.email}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Batch <span className="font-medium text-slate-700">{detail.batch}</span> · SPOC{" "}
                    <span className="font-medium text-slate-700">{detail.spoc ?? "—"}</span>
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {detail.status.replace("_", " ")}
                </span>
              </div>
            </Card>

            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total tasks" value={String(stats.total)} />
              <StatCard label="Completed" value={String(stats.completed)} />
              <StatCard label="Overdue" value={String(stats.overdue)} />
              <StatCard label="Attendance" value={`${stats.attendanceRate}%`} />
            </section>

            <Card>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Tasks</h2>
              {detail.tasks.length === 0 ? (
                <p className="text-sm text-slate-400">No tasks assigned.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                        <th className="pb-2 pr-4">Task</th>
                        <th className="pb-2 pr-4">Due</th>
                        <th className="pb-2 pr-4">Priority</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.tasks.map((task) => (
                        <tr key={task.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-4">
                            <p className="font-medium text-slate-800">{task.taskName}</p>
                            {task.description && (
                              <p className="text-xs text-slate-400">{task.description}</p>
                            )}
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

            <Card>
              <h2 className="mb-4 text-lg font-semibold text-slate-900">Attendance</h2>
              {detail.attendance.length === 0 ? (
                <p className="text-sm text-slate-400">No attendance records.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.attendance.map((a) => (
                    <span
                      key={a.id}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                        a.status === "PRESENT"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-700"
                      }`}
                      title={a.status}
                    >
                      {new Date(a.date).toLocaleDateString()}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
