const assert = require("assert");
const { evaluateHybridDecision } = require("../src/services/hybridDecisionEngine");

function testHybridDecisionEngine() {
  console.log("  Testing calibrated hybrid decision engine...");

  // 1. Schema invalid always invalid
  const schemaInvalid = evaluateHybridDecision({
    schemaValid: false,
    ruleClassification: "valid",
    ruleRiskScore: 0.1,
    mlResult: { isAnomaly: false, anomalyScore: 0.1, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(schemaInvalid.officialClassification, "invalid");
  assert.strictEqual(schemaInvalid.comparisonCategory, "not_applicable");

  // 2. Rule normal + ML normal -> valid
  const bothNormal = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "valid",
    ruleRiskScore: 0.15,
    mlResult: { isAnomaly: false, anomalyScore: 0.25, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(bothNormal.officialClassification, "valid");
  assert.strictEqual(bothNormal.comparisonCategory, "rule_normal_ml_normal");

  // 3. Rule anomaly + ML anomaly -> consensus invalid
  const bothAnomaly = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "suspicious",
    ruleRiskScore: 0.45,
    mlResult: { isAnomaly: true, anomalyScore: 0.85, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(bothAnomaly.hybridClassification, "invalid");
  assert.strictEqual(bothAnomaly.officialClassification, "invalid");
  assert.strictEqual(bothAnomaly.comparisonCategory, "rule_anomaly_ml_anomaly");

  // 4. Rule anomaly + ML normal -> suspicious (escalated for review)
  const ruleOnlyAnomaly = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "invalid",
    ruleRiskScore: 0.75,
    mlResult: { isAnomaly: false, anomalyScore: 0.30, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(ruleOnlyAnomaly.hybridClassification, "suspicious");
  assert.strictEqual(ruleOnlyAnomaly.comparisonCategory, "rule_anomaly_ml_normal");
  assert.ok(ruleOnlyAnomaly.disagreementReason.includes("Disagreement:"));

  // 5. Rule normal + ML anomaly -> suspicious (ML detected multidimensional outlier)
  const mlOnlyAnomaly = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "valid",
    ruleRiskScore: 0.10,
    mlResult: { isAnomaly: true, anomalyScore: 0.80, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(mlOnlyAnomaly.hybridClassification, "suspicious");
  assert.strictEqual(mlOnlyAnomaly.comparisonCategory, "rule_normal_ml_anomaly");

  // 6. Shadow mode preserves official rule authority
  const shadowMode = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "valid",
    ruleRiskScore: 0.10,
    mlResult: { isAnomaly: true, anomalyScore: 0.88, status: "success" },
    mode: "shadow",
  });
  assert.strictEqual(shadowMode.officialClassification, "valid", "In shadow mode, official classification must follow rule engine");
  assert.strictEqual(shadowMode.hybridClassification, "suspicious", "In shadow mode, hybrid classification is computed and visible");

  // 7. ML service fallback handles outages gracefully
  const mlOutage = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "suspicious",
    ruleRiskScore: 0.40,
    mlResult: { isAnomaly: false, anomalyScore: 0.0, status: "fallback", error: "Connection refused" },
    mode: "hybrid",
  });
  assert.strictEqual(mlOutage.officialClassification, "suspicious");
  assert.ok(mlOutage.disagreementReason.includes("unavailable"));

  console.log("  [ok] Calibrated hybrid decision engine passed all policies.");
}

module.exports = { testHybridDecisionEngine };
