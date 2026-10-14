const express = require("express");
const router = express.Router();
const {
  getModels,
  triggerTraining,
  promote,
  rollback,
} = require("../controllers/model.controller");

router.get("/", getModels);
router.post("/train", triggerTraining);
router.post("/:version/promote", promote);
router.post("/rollback", rollback);

module.exports = router;
