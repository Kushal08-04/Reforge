const assert = require("assert");
const { createRepairPullRequest } = require("../src/services/githubService");

async function testGitHubIntegration() {
  console.log("  Testing GitHub integration safety boundaries...");

  // 1. Unverified proposal must reject PR creation
  const mongoose = require("mongoose");
  const mockUnverifiedProposal = {
    _id: new mongoose.Types.ObjectId(),
    rawObservationId: new mongoose.Types.ObjectId(),
    lifecycleState: "PROPOSED",
    entityId: "zone-a-temperature",
    failureCategory: "implausible_jump",
    findById: function () {
      return this;
    },
  };

  // Mock model query
  const originalFindById = require("../src/models").RepairProposal.findById;
  const auditService = require("../src/services/auditService");
  const originalLogAudit = auditService.logAudit;
  auditService.logAudit = async () => ({});

  require("../src/models").RepairProposal.findById = async function (id) {
    if (id === "unverified") return mockUnverifiedProposal;
    if (id === "verified") {
      return {
        _id: new mongoose.Types.ObjectId(),
        rawObservationId: new mongoose.Types.ObjectId(),
        lifecycleState: "VERIFIED",
        entityId: "zone-b-humidity",
        failureCategory: "cross_sensor_inconsistency",
        rootCauseHypothesis: "Diverged from peer sensors",
        proposedPatch: {
          targetFile: "pipeline/calibration.js",
          patchType: "calibration_offset",
          diff: "+ // calibration fix",
          codeAfter: "function applyCalibration() {}",
        },
        sandboxResult: {
          status: "PASS",
          containerId: "docker_container",
          testsPassed: 3,
          testsTotal: 3,
          semanticChecksPassed: true,
          executionTimeMs: 140,
        },
        risksAndAssumptions: ["Test assumption"],
        stateHistory: [],
        save: async function () {
          return this;
        },
      };
    }
    return null;
  };

  try {
    // Attempting PR on unverified proposal must throw error
    let thrown = false;
    try {
      await createRepairPullRequest("unverified", "tester");
    } catch (err) {
      thrown = true;
      assert.ok(err.message.includes("Safety guard violation"), "Must block unverified PR");
    }
    assert.strictEqual(thrown, true, "Must throw safety exception on unverified proposal");

    // Creating PR on verified proposal should succeed and return PR metadata
    const verifiedResult = await createRepairPullRequest("verified", "tester");
    assert.strictEqual(verifiedResult.lifecycleState, "PR_CREATED");
    assert.ok(verifiedResult.githubIntegration.branchName.startsWith("reforge/repair-"));
    assert.ok(verifiedResult.githubIntegration.prUrl.includes("github.com"));
    assert.ok(verifiedResult.githubIntegration.commitSha);
  } finally {
    require("../src/models").RepairProposal.findById = originalFindById;
    auditService.logAudit = originalLogAudit;
  }

  console.log("  [ok] GitHub integration safety guards and PR builder passed.");
}

module.exports = { testGitHubIntegration };
