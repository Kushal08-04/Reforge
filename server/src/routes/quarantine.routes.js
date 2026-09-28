const express = require("express");
const router = express.Router();
const {
  listQuarantine,
  getQuarantineDetail,
  reviewQuarantine,
} = require("../controllers/quarantine.controller");

router.get("/", listQuarantine);
router.get("/:id", getQuarantineDetail);
router.patch("/:id/review", reviewQuarantine);

module.exports = router;
