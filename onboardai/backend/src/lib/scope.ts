import { prisma } from "./prisma";
import type { AuthUser } from "../middleware/auth";

// A SPOC supervises the trainees whose `spoc` field equals the SPOC's own
// trainee name. This resolves that name from the SPOC user's linked Trainee.
export async function getSupervisedName(user: AuthUser): Promise<string | null> {
  if (user.role !== "SPOC" || !user.traineeId) return null;
  const trainee = await prisma.trainee.findUnique({
    where: { id: user.traineeId },
    select: { name: true },
  });
  return trainee?.name ?? null;
}

// Internal Trainee ids the SPOC supervises. Returns [] if the SPOC supervises
// nobody (so callers filtering by `in: []` correctly return nothing).
export async function getSupervisedTraineeIds(user: AuthUser): Promise<string[]> {
  const name = await getSupervisedName(user);
  if (!name) return [];
  const trainees = await prisma.trainee.findMany({
    where: { spoc: name },
    select: { id: true },
  });
  return trainees.map((t) => t.id);
}
