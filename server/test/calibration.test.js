/**
 * calibration.test.js
 * -------------------
 * Unit tests for pipeline/calibration.js validating:
 * 1. Normal readings within tolerance
 * 2. Cross-sensor anomalies exceeding threshold (routed to review, raw preserved)
 * 3. Missing peer cluster means (graceful fallback)
 * 4. Insufficient peer count (< 2 peers)
 * 5. Invalid numbers (NaN, null, strings, Infinity)
 * 6. Unit mismatches (e.g., Celsius vs Fahrenheit)
 * 7. Untrusted peer sensors (consensus discarded)
 * 8. Calibration boundary conditions (at, below, above 15.0 threshold)
 * 9. Validated offset application (trustworthy correction applied without destructive blending)
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const calibrationPath = fs.existsSync(path.join(__dirname, "../pipeline/calibration.js"))
  ? path.join(__dirname, "../pipeline/calibration.js")
  : path.join(__dirname, "../../pipeline/calibration.js");
const {
  applyCalibration,
  evaluateCalibration,
  DEFAULT_DEVIATION_THRESHOLD,
  MIN_PEER_COUNT,
} = require(calibrationPath);

function testCalibrationModule() {
  console.log("  Testing sensor calibration and peer consensus module...");

  // 1. Normal readings within peer consensus
  {
    const res = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 25.2,
      peerClusterMean: 24.8,
      peerCount: 3,
    });
    assert.strictEqual(res.status, "IN_CONSENSUS");
    assert.strictEqual(res.action, "ACCEPT");
    assert.strictEqual(res.calibratedValue, 25.2);
    assert.strictEqual(res.anomalyDetected, false);
    assert.strictEqual(applyCalibration("zone-a-temperature", 25.2, 24.8), 25.2);
  }

  // 2. Anomalous reading exceeding threshold without validated offset
  // Raw reading must be preserved; observation routed to review rather than altered
  {
    const res = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 45.0,
      peerClusterMean: 24.0,
      peerCount: 3,
    });
    assert.strictEqual(res.status, "CROSS_SENSOR_DIVERGENCE");
    assert.strictEqual(res.action, "ROUTE_TO_REVIEW");
    assert.strictEqual(res.calibratedValue, 45.0, "Raw reading must be preserved without destructive blending");
    assert.strictEqual(res.anomalyDetected, true);
    assert.strictEqual(res.deviation, 21.0);
    // Function call preserves raw reading
    assert.strictEqual(applyCalibration("zone-a-temperature", 45.0, 24.0), 45.0);
  }

  // 3. Missing peer cluster means
  {
    const resNull = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 24.5,
      peerClusterMean: null,
    });
    assert.strictEqual(resNull.status, "NO_PEER_CONSENSUS");
    assert.strictEqual(resNull.action, "ACCEPT_RAW");
    assert.strictEqual(resNull.calibratedValue, 24.5);
    assert.strictEqual(applyCalibration("zone-a-temperature", 24.5, null), 24.5);

    const resUndef = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 24.5,
      peerClusterMean: undefined,
    });
    assert.strictEqual(resUndef.status, "NO_PEER_CONSENSUS");
    assert.strictEqual(resUndef.action, "ACCEPT_RAW");
  }

  // 4. Insufficient peers in peer cluster (< 2 peers)
  {
    const res = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 45.0,
      peerClusterMean: 24.0,
      peerCount: 1, // Only 1 peer - insufficient
    });
    assert.strictEqual(res.status, "INSUFFICIENT_PEERS");
    assert.strictEqual(res.action, "ACCEPT_RAW");
    assert.strictEqual(res.calibratedValue, 45.0);
    assert.strictEqual(res.anomalyDetected, false);
  }

  // 5. Invalid numeric readings
  {
    const resNaN = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: NaN,
      peerClusterMean: 24.0,
    });
    assert.strictEqual(resNaN.status, "INVALID_INPUT");
    assert.strictEqual(resNaN.action, "REJECT");
    assert.strictEqual(resNaN.calibratedValue, null);

    const resStr = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: "not-a-number",
      peerClusterMean: 24.0,
    });
    assert.strictEqual(resStr.status, "INVALID_INPUT");

    const resInf = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: Infinity,
      peerClusterMean: 24.0,
    });
    assert.strictEqual(resInf.status, "INVALID_INPUT");
    assert.strictEqual(Number.isNaN(applyCalibration("zone-a-temp", NaN, 24.0)), true);
  }

  // 6. Unit mismatch detection
  {
    const resMismatch = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 77.0, // Fahrenheit
      peerClusterMean: 25.0, // Celsius
      unit: "F",
      peerUnit: "C",
      peerCount: 3,
    });
    assert.strictEqual(resMismatch.status, "UNIT_MISMATCH");
    assert.strictEqual(resMismatch.action, "ROUTE_TO_REVIEW");
    assert.strictEqual(resMismatch.anomalyDetected, true);
    assert.strictEqual(resMismatch.calibratedValue, 77.0, "Raw reading must be preserved on unit mismatch");
    assert.ok(resMismatch.reason.includes("Unit mismatch"));
  }

  // 7. Untrusted peer sensors
  {
    const resUntrusted = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 30.0,
      peerClusterMean: 10.0,
      peerCount: 3,
      trustedPeers: false,
    });
    assert.strictEqual(resUntrusted.status, "UNTRUSTED_PEERS");
    assert.strictEqual(resUntrusted.action, "ROUTE_TO_REVIEW");
    assert.strictEqual(resUntrusted.anomalyDetected, true);
    assert.strictEqual(resUntrusted.calibratedValue, 30.0);
  }

  // 8. Calibration boundary checks (threshold = 15.0)
  {
    // Exactly at threshold boundary (deviation = 15.0)
    const atBoundary = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 39.0,
      peerClusterMean: 24.0, // diff = 15.0
      peerCount: 2,
    });
    assert.strictEqual(atBoundary.status, "IN_CONSENSUS");
    assert.strictEqual(atBoundary.action, "ACCEPT");
    assert.strictEqual(atBoundary.deviation, 15.0);

    // Just above threshold boundary (deviation = 15.01)
    const aboveBoundary = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 39.01,
      peerClusterMean: 24.0, // diff = 15.01 > 15.0
      peerCount: 2,
    });
    assert.strictEqual(aboveBoundary.status, "CROSS_SENSOR_DIVERGENCE");
    assert.strictEqual(aboveBoundary.action, "ROUTE_TO_REVIEW");

    // Just below threshold boundary (deviation = 14.99)
    const belowBoundary = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 38.99,
      peerClusterMean: 24.0, // diff = 14.99 <= 15.0
      peerCount: 2,
    });
    assert.strictEqual(belowBoundary.status, "IN_CONSENSUS");
    assert.strictEqual(belowBoundary.action, "ACCEPT");
  }

  // 9. Validated offset application (legitimate calibration model available)
  {
    const resOffset = evaluateCalibration({
      entityId: "zone-a-temperature",
      rawValue: 42.0,
      peerClusterMean: 25.0,
      peerCount: 3,
      validatedOffset: 2.5, // Verified factory calibration offset
    });
    assert.strictEqual(resOffset.status, "OFFSET_APPLIED");
    assert.strictEqual(resOffset.action, "APPLY_CALIBRATION");
    assert.strictEqual(resOffset.calibratedValue, 39.5, "Calibrated value must subtract verified offset");
    assert.strictEqual(resOffset.anomalyDetected, false);

    const appliedVal = applyCalibration("zone-a-temperature", 42.0, 25.0, { validatedOffset: 2.5 });
    assert.strictEqual(appliedVal, 39.5);
  }

  console.log("  [ok] Sensor calibration and peer consensus module passed all test cases.");
}

module.exports = { testCalibrationModule };
