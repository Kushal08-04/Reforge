const express = require("express");
const router = express.Router();
const { getValidation } = require("../controllers/validate.controller");

router.get("/:id", getValidation);

module.exports = router;
