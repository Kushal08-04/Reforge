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

  // 8. Regression test: Borderline ML prediction without corroborating risk is suppressed to prevent FP
  const borderlineMlSuppressed = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "valid",
    ruleRiskScore: 0.05,
    mlResult: { isAnomaly: true, anomalyScore: 0.58, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(borderlineMlSuppressed.officialClassification, "valid");
  assert.strictEqual(borderlineMlSuppressed.hybridClassification, "valid");
  assert.strictEqual(borderlineMlSuppressed.comparisonCategory, "rule_normal_ml_anomaly");
  assert.ok(borderlineMlSuppressed.disagreementReason.includes("Preserved rule-based baseline"));

  // 9. Regression test: Subtle ML anomaly with corroborating rule risk is escalated to suspicious
  const subtleCorroboratedAnomaly = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "valid",
    ruleRiskScore: 0.20,
    mlResult: { isAnomaly: true, anomalyScore: 0.62, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(subtleCorroboratedAnomaly.officialClassification, "suspicious");
  assert.strictEqual(subtleCorroboratedAnomaly.hybridClassification, "suspicious");
  assert.strictEqual(subtleCorroboratedAnomaly.comparisonCategory, "rule_normal_ml_anomaly");
  assert.ok(subtleCorroboratedAnomaly.disagreementReason.includes("corroborating rule risk"));

  // 10. Regression test: High confidence ML anomaly is escalated even if rules scored 0 risk
  const highConfidenceAnomaly = evaluateHybridDecision({
    schemaValid: true,
    ruleClassification: "valid",
    ruleRiskScore: 0.0,
    mlResult: { isAnomaly: true, anomalyScore: 0.85, status: "success" },
    mode: "hybrid",
  });
  assert.strictEqual(highConfidenceAnomaly.officialClassification, "suspicious");
  assert.strictEqual(highConfidenceAnomaly.hybridClassification, "suspicious");
  assert.strictEqual(highConfidenceAnomaly.comparisonCategory, "rule_normal_ml_anomaly");
  assert.ok(highConfidenceAnomaly.disagreementReason.includes("high confidence"));

  console.log("  [ok] Calibrated hybrid decision engine passed all policies.");
}

module.exports = { testHybridDecisionEngine };
