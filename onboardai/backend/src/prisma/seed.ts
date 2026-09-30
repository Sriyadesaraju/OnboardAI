import { PrismaClient, TraineeStatus, Priority, TaskStatus, AttendanceStatus, UserRole } from "@prisma/client";
import bcrypt from "bcrypt";
import seedData from "./seedData.json";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";
const BCRYPT_COST = 12;

const traineeStatusMap: Record<string, TraineeStatus> = {
  Active: "ACTIVE",
  Completed: "COMPLETED",
  "On Hold": "ON_HOLD",
};

const priorityMap: Record<string, Priority> = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
};

const taskStatusMap: Record<string, TaskStatus> = {
  Pending: "PENDING",
  "In Progress": "IN_PROGRESS",
  Completed: "COMPLETED",
};

const attendanceStatusMap: Record<string, AttendanceStatus> = {
  Present: "PRESENT",
  Absent: "ABSENT",
};

function parseUsDate(value: string): Date {
  const [month, day, year] = value.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// SPOCs are trainees too: they get their own Trainee record + a SPOC-role User.
// Their `name` must exactly match the `spoc` string on the trainees they
// supervise (that string field is the allocation mechanism).
const SPOCS = [
  { traineeId: 1301, name: "Kiran Reddy", email: "kiran.reddy@abc.com", batch: "EPH July" },
  { traineeId: 1302, name: "Meena Menon", email: "meena.menon@abc.com", batch: "EPH July" },
  { traineeId: 1303, name: "Suresh Babu", email: "suresh.babu@abc.com", batch: "EPH Aug" },
];

// A small set of onboarding tasks the SPOCs get as trainees themselves, so
// their own "My tasks" view is populated just like any other trainee.
const SPOC_OWN_TASKS = [
  { taskName: "Complete SPOC Enablement", description: "Finish the mentor/SPOC enablement module", due: "07/12/2026", priority: "High", status: "Completed" },
  { taskName: "Review Batch Onboarding Plan", description: "Review and sign off the onboarding plan for your batch", due: "07/22/2026", priority: "Medium", status: "In Progress" },
  { taskName: "Submit Monthly Mentorship Report", description: "Submit the monthly mentorship progress report", due: "08/05/2026", priority: "Medium", status: "Pending" },
];

async function main() {
  // Idempotent: clear in FK-safe order so re-running the seed is always safe.
  console.log("Clearing existing data...");
  await prisma.attendance.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  await prisma.trainee.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);

  console.log("Seeding manager + admin accounts...");
  await prisma.user.create({
    data: { email: "manager@onboardai.demo", passwordHash, role: UserRole.MANAGER },
  });
  await prisma.user.create({
    data: { email: "admin@onboardai.demo", passwordHash, role: UserRole.ADMIN },
  });

  console.log("Seeding trainees...");
  const traineeIdByNumericId = new Map<number, string>();
  for (const row of seedData.Trainees as Array<Record<string, unknown>>) {
    const trainee = await prisma.trainee.create({
      data: {
        traineeId: row.TraineeID as number,
        name: row.Name as string,
        email: row.Email as string,
        spoc: (row.SPOC as string) ?? null,
        batch: row.Batch as string,
        status: traineeStatusMap[row.Status as string] ?? "ACTIVE",
      },
    });
    traineeIdByNumericId.set(row.TraineeID as number, trainee.id);

    await prisma.user.create({
      data: {
        email: trainee.email,
        passwordHash,
        role: UserRole.TRAINEE,
        traineeId: trainee.id,
      },
    });
  }

  console.log("Seeding SPOCs (as trainees + SPOC users)...");
  for (const spoc of SPOCS) {
    const trainee = await prisma.trainee.create({
      data: {
        traineeId: spoc.traineeId,
        name: spoc.name,
        email: spoc.email,
        spoc: null, // SPOCs are not themselves supervised in this demo
        batch: spoc.batch,
        status: TraineeStatus.ACTIVE,
      },
    });
    traineeIdByNumericId.set(spoc.traineeId, trainee.id);

    await prisma.user.create({
      data: {
        email: spoc.email,
        passwordHash,
        role: UserRole.SPOC,
        traineeId: trainee.id,
      },
    });

    for (const t of SPOC_OWN_TASKS) {
      await prisma.task.create({
        data: {
          taskName: t.taskName,
          description: t.description,
          traineeId: trainee.id,
          dueDate: parseUsDate(t.due),
          priority: priorityMap[t.priority] ?? "MEDIUM",
          status: taskStatusMap[t.status] ?? "PENDING",
          createdBy: "seed",
        },
      });
    }
  }

  console.log("Seeding tasks...");
  for (const row of seedData.Tasks as Array<Record<string, unknown>>) {
    const traineeId = traineeIdByNumericId.get(row.AssignedTo as number);
    if (!traineeId) {
      console.warn(`Skipping task for unknown trainee ${row.AssignedTo}`);
      continue;
    }
    await prisma.task.create({
      data: {
        taskName: row.TaskName as string,
        description: (row.Description as string) ?? null,
        traineeId,
        dueDate: parseUsDate(row.DueDate as string),
        priority: priorityMap[row.Priority as string] ?? "MEDIUM",
        status: taskStatusMap[row.Status as string] ?? "PENDING",
        createdBy: "seed",
      },
    });
  }

  console.log("Seeding attendance...");
  for (const row of seedData.Attendance as Array<Record<string, unknown>>) {
    const traineeId = traineeIdByNumericId.get(row.Trainee as number);
    if (!traineeId) {
      console.warn(`Skipping attendance for unknown trainee ${row.Trainee}`);
      continue;
    }
    await prisma.attendance.create({
      data: {
        traineeId,
        date: parseUsDate(row.Date as string),
        status: attendanceStatusMap[row.Status as string] ?? "PRESENT",
        createdBy: "seed",
      },
    });
  }

  console.log("Seed complete.");
  console.log(`Demo login password for all seeded accounts: ${DEMO_PASSWORD}`);
  console.log("SPOC demo account: kiran.reddy@abc.com (supervises trainees whose SPOC is 'Kiran Reddy')");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
