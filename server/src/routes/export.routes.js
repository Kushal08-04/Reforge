const express = require("express");
const router = express.Router();
const {
  exportDatasetCsv,
  exportDatasetXlsx,
  exportRepairReportPdf,
  exportDatasetToGitHub,
  listVersions,
  createSnapshot,
} = require("../controllers/export.controller");

router.get("/csv", exportDatasetCsv);
router.get("/xlsx", exportDatasetXlsx);
router.get("/pdf", exportRepairReportPdf);
router.post("/github", exportDatasetToGitHub);
router.get("/versions", listVersions);
router.post("/snapshot", createSnapshot);

module.exports = router;
