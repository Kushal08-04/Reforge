const assert = require("assert");
const {
  rateOfChangeRule,
  historicalZScoreRule,
  crossSensorRule,
  implausibleJumpRule,
} = require("../src/services/ruleEngine");
const { scoreAndClassify, RULE_WEIGHTS } = require("../src/services/scoringEngine");

function testRules() {
  console.log("  Testing deterministic semantic rules...");

  // 1. Rate of Change Rule
  const normalRoc = rateOfChangeRule(25.5, { rateOfChange: 0.5, rollingStd: 1.0 });
  assert.strictEqual(normalRoc.triggered, false, "Small rate of change should not trigger");

  const spikeRoc = rateOfChangeRule(35.0, { rateOfChange: 10.0, rollingStd: 1.0 });
  assert.strictEqual(spikeRoc.triggered, true, "10x std rate of change should trigger");
  assert.ok(spikeRoc.severity > 0, "Severity must be positive");

  // 2. Historical Z-Score Rule
  const normalZ = historicalZScoreRule(25.2, { historicalZScore: 0.2, rollingMean: 25.0 });
  assert.strictEqual(normalZ.triggered, false, "Small z-score should not trigger");

  const extremeZ = historicalZScoreRule(38.0, { historicalZScore: 4.5, rollingMean: 25.0 });
  assert.strictEqual(extremeZ.triggered, true, ">3.0 z-score should trigger");

  // 3. Cross Sensor Rule
  const agreedCross = crossSensorRule(25.0, { crossSensorDeviation: 0.5, crossSensorMean: 25.0, peerGroupSize: 3 });
  assert.strictEqual(agreedCross.triggered, false, "Peer agreement should not trigger");

  const disagreedCross = crossSensorRule(10.0, { crossSensorDeviation: 4.2, crossSensorMean: 25.0, peerGroupSize: 3 });
  assert.strictEqual(disagreedCross.triggered, true, ">3.0 peer deviation should trigger");

  // 4. Implausible Jump Rule
  const normalJump = implausibleJumpRule(25.5, { rateOfChange: 1.0, rollingStd: 1.0 });
  assert.strictEqual(normalJump.triggered, false, "Normal delta should not trigger implausible jump");

  const hugeJump = implausibleJumpRule(80.0, { rateOfChange: 55.0, rollingStd: 1.0 });
  assert.strictEqual(hugeJump.triggered, true, "+55.0 delta should trigger implausible jump");

  // 5. Scoring Engine
  const mockEvidence = [
    { source: "rateOfChangeRule", triggered: true, severity: 0.8 },
    { source: "historicalZScoreRule", triggered: true, severity: 0.9 },
    { source: "crossSensorRule", triggered: false, severity: 0.0 },
    { source: "implausibleJumpRule", triggered: false, severity: 0.0 },
  ];
  const scoreRes = scoreAndClassify(mockEvidence);
  // (0.2 * 0.8) + (0.3 * 0.9) = 0.16 + 0.27 = 0.43 -> suspicious
  assert.ok(scoreRes.score >= 0.40 && scoreRes.score <= 0.45);
  assert.strictEqual(scoreRes.classification, "suspicious");

  console.log("  [ok] Semantic rules and scoring engine passed.");
}

module.exports = { testRules };
