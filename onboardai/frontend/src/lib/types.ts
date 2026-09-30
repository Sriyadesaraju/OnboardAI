export type UserRole = "MANAGER" | "SPOC" | "TRAINEE" | "ADMIN";
export type AttendanceStatusValue = "PRESENT" | "ABSENT";
export type TraineeStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD";
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type AttendanceStatus = "PRESENT" | "ABSENT";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  traineeId: string | null;
}

export interface Trainee {
  id: string;
  traineeId: number;
  name: string;
  email: string;
  spoc: string | null;
  batch: string;
  status: TraineeStatus;
}

export interface Task {
  id: string;
  taskName: string;
  description: string | null;
  traineeId: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  createdBy?: string | null;
  assignedTo?: { id: string; name: string; traineeId: number };
}

export interface Attendance {
  id: string;
  traineeId: string;
  date: string;
  status: AttendanceStatusValue;
}

export interface TraineeDetail extends Trainee {
  tasks: Task[];
  attendance: Attendance[];
}

export interface WeeklySummary {
  generatedAt: string;
  completionRatePercent: number;
  overdueTaskCount: number;
  attendanceRatePercent: number;
  totalTasks: number;
  totalAttendanceRecords: number;
}

export interface RiskFlag {
  traineeId: string;
  traineeNumericId: number;
  name: string;
  batch: string;
  spoc: string | null;
  overdueTaskCount: number;
  attendanceRatePercent: number;
  reasons: string[];
}
