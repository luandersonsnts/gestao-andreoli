import express from "express";
import cors from "cors";
import path from "node:path";
import { getEnv } from "./config/env.js";
import { errorMiddleware } from "./http/errorMiddleware.js";
import { authRouter } from "./routes/auth.js";
import { clientsRouter } from "./routes/clients.js";
import { boletosEnviosRouter } from "./routes/boletosEnvios.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { notificationsRouter } from "./routes/notifications.js";
import { usersRouter } from "./routes/users.js";

export function createApp() {
  const env = getEnv();
  const app = express();

  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (env.NODE_ENV !== "production") return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "2mb" }));

  const uploadsPath = path.resolve(env.UPLOAD_DIR);
  app.use("/uploads", express.static(uploadsPath));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/boletos-envios", boletosEnviosRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/users", usersRouter);

  app.use(errorMiddleware);
  return app;
}
