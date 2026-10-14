const express = require("express");
const router = express.Router();
const { getComparison } = require("../controllers/comparison.controller");

router.get("/", getComparison);

module.exports = router;
