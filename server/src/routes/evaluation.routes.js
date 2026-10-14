const express = require("express");
const router = express.Router();
const { getLatest, triggerRun, getHistory } = require("../controllers/evaluation.controller");

router.get("/latest", getLatest);
router.post("/run", triggerRun);
router.get("/history", getHistory);

module.exports = router;
