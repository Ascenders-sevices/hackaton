/**
 * AIR BEE — CRUD API Lambda
 * Monolambda for all CRUD operations: rooms, bookings, guests, housekeeping, settings.
 * Uses Express wrapped with @vendia/serverless-express.
 *
 * API Gateway HTTP API routes: ANY /api/{proxy+}
 * JWT authorizer: Cognito User Pool
 *
 * Env vars: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

import serverlessExpress from "@vendia/serverless-express";
import express from "express";
import cors from "cors";

import roomsRouter from "./routes/rooms.js";
import bookingsRouter from "./routes/bookings.js";
import guestsRouter from "./routes/guests.js";
import housekeepingRouter from "./routes/housekeeping.js";
import settingsRouter from "./routes/settings.js";
import dashboardRouter from "./routes/dashboard.js";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Extract tenantId and userSub from Cognito JWT claims (set by API Gateway authorizer)
app.use((req, res, next) => {
  const claims = req.apiGateway?.event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims) {
    return res.status(401).json({ error: "Unauthorized: no JWT claims" });
  }
  req.userSub = claims.sub;
  req.tenantId = claims["custom:tenant_id"];
  if (!req.tenantId) {
    return res.status(403).json({ error: "Forbidden: no tenant_id in token" });
  }
  next();
});

app.use("/api/rooms", roomsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/guests", guestsRouter);
app.use("/api/housekeeping", housekeepingRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

export const handler = serverlessExpress({ app });
