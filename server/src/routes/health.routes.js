const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

router.get("/", (req, res) => {
  const dbStateMap = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  const dbState = mongoose.connection.readyState;

  res.status(200).json({
    status: "ok",
    service: "reforge-server",
    timestamp: new Date().toISOString(),
    database: { state: dbStateMap[dbState] || "unknown", name: mongoose.connection.name || null },
  });
});

module.exports = router;
