import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth";
import traineeRoutes from "./routes/trainees";
import taskRoutes from "./routes/tasks";
import attendanceRoutes from "./routes/attendance";
import reportRoutes from "./routes/reports";
import agentRoutes from "./routes/agent";

const app = express();
const PORT = process.env.PORT ?? 3000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", generalRateLimit);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/trainees", traineeRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/agent", agentRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "NotFound", message: "Route not found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "InternalServerError", message: "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`OnboardAI backend listening on port ${PORT}`);
});
