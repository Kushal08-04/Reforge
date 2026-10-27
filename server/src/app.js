const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const healthRoutes = require("./routes/health.routes");
const ingestRoutes = require("./routes/ingest.routes");
const validateRoutes = require("./routes/validate.routes");
const quarantineRoutes = require("./routes/quarantine.routes");
const auditRoutes = require("./routes/audit.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const comparisonRoutes = require("./routes/comparison.routes");
const evaluationRoutes = require("./routes/evaluation.routes");
const modelRoutes = require("./routes/model.routes");
const repairRoutes = require("./routes/repair.routes");
const exportRoutes = require("./routes/export.routes");

const app = express();
const PORT = process.env.PORT || 5000;

// ---- Middleware ----
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ---- Routes ----
app.use("/api/health", healthRoutes);
app.use("/api/ingest", ingestRoutes);
app.use("/api/validation", validateRoutes);
app.use("/api/quarantine", quarantineRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/comparison", comparisonRoutes);
app.use("/api/evaluation", evaluationRoutes);
app.use("/api/models", modelRoutes);
app.use("/api/repairs", repairRoutes);
app.use("/api/export", exportRoutes);

app.get("/", (req, res) => {
  res.send("REFORGE server is running. See /api/health for status.");
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[REFORGE] Unhandled error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[REFORGE] Server listening on port ${PORT}`);
    console.log(`[REFORGE] Health check: http://localhost:${PORT}/api/health`);
  });
}

start();

module.exports = app;
