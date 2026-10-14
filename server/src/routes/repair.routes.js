const express = require("express");
const router = express.Router();
const {
  listRepairs,
  getRepairDetail,
  diagnose,
  executeSandbox,
  createPR,
  reviewRepair,
} = require("../controllers/repair.controller");

router.get("/", listRepairs);
router.post("/diagnose", diagnose);
router.get("/:id", getRepairDetail);
router.post("/:id/sandbox", executeSandbox);
router.post("/:id/create-pr", createPR);
router.patch("/:id/review", reviewRepair);

module.exports = router;
