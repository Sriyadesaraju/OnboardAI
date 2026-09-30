import { Link } from "react-router-dom";
import type { Trainee } from "../lib/types";
import { Card } from "./ui";

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-sky-100 text-sky-700",
  ON_HOLD: "bg-amber-100 text-amber-800",
};

// Clickable roster of trainees; each row links to that trainee's detail page.
export default function TraineeRoster({
  trainees,
  title = "Trainees",
  showSpoc = false,
}: {
  trainees: Trainee[];
  title?: string;
  showSpoc?: boolean;
}) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        {title} <span className="text-sm font-normal text-slate-400">({trainees.length})</span>
      </h2>
      {trainees.length === 0 ? (
        <p className="text-sm text-slate-400">No trainees.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {trainees.map((t) => (
            <li key={t.id}>
              <Link
                to={`/trainees/${t.id}`}
                className="flex items-center justify-between gap-3 py-2.5 group"
              >
                <div>
                  <p className="font-medium text-slate-800 group-hover:text-slate-950">
                    {t.name} <span className="text-xs font-normal text-slate-400">#{t.traineeId}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {t.batch}
                    {showSpoc && t.spoc ? ` · SPOC ${t.spoc}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusStyles[t.status] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                  <span className="text-slate-300 group-hover:text-slate-500">→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
