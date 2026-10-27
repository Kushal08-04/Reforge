const assert = require("assert");
const mongoose = require("mongoose");
const { reviewRepair, createPR, getRepairDetail } = require("../src/controllers/repair.controller");
const { createRepairPullRequest } = require("../src/services/githubService");

/**
 * Mock Express Response helper for controller unit testing
 */
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function testRepairLifecycle() {
  console.log("  Testing repair lifecycle, review API guards, and state separation...");

  // Backup original models and services
  const RepairProposalModel = require("../src/models").RepairProposal;
  const originalFindById = RepairProposalModel.findById;
  const auditService = require("../src/services/auditService");
  const originalLogAudit = auditService.logAudit;
  auditService.logAudit = async () => ({});

  // Test fixtures
  const sandboxFailedProposalId = new mongoose.Types.ObjectId();
  const verifiedProposalId = new mongoose.Types.ObjectId();
  const terminalProposalId = new mongoose.Types.ObjectId();
  const nonExistentId = new mongoose.Types.ObjectId();

  function buildMockProposal(state, sandboxStatus, humanReview = null) {
    return {
      _id: new mongoose.Types.ObjectId(),
      rawObservationId: new mongoose.Types.ObjectId(),
      lifecycleState: state,
      entityId: "zone-b-humidity",
      failureCategory: "cross_sensor_inconsistency",
      rootCauseHypothesis: "Divergence from peer sensors",
      proposedPatch: {
        targetFile: "pipeline/calibration.js",
        patchType: "calibration_offset",
        diff: "+ // calibration fix",
        codeAfter: "function applyCalibration() {}",
        applicationState: "applied",
      },
      sandboxResult: {
        status: sandboxStatus,
        runtimeIsolation: "docker",
        containerId: "docker_test_123",
        testsPassed: sandboxStatus === "PASS" ? 3 : 0,
        testsTotal: 3,
        semanticChecksPassed: sandboxStatus === "PASS",
        executionTimeMs: 140,
        failureReason: sandboxStatus === "FAIL" ? "Unit test assertion failed" : null,
      },
      humanReview: humanReview,
      stateHistory: [],
      save: async function () {
        return this;
      },
    };
  }

  const mockSandboxFailed = buildMockProposal("SANDBOX_FAILED", "FAIL");
  mockSandboxFailed._id = sandboxFailedProposalId;

  const mockVerified = buildMockProposal("VERIFIED", "PASS");
  mockVerified._id = verifiedProposalId;

  const mockTerminal = buildMockProposal("MERGED", "PASS", { decision: "approved", reviewer: "lead" });
  mockTerminal._id = terminalProposalId;

  // Mock findById
  RepairProposalModel.findById = function (id) {
    const idStr = id.toString();
    const queryObj = {
      populate: function () {
        return this;
      },
      lean: async function () {
        if (idStr === sandboxFailedProposalId.toString()) return mockSandboxFailed;
        if (idStr === verifiedProposalId.toString()) return mockVerified;
        return null;
      },
    };

    if (idStr === sandboxFailedProposalId.toString()) {
      return Promise.resolve(mockSandboxFailed);
    }
    if (idStr === verifiedProposalId.toString()) {
      return Promise.resolve(mockVerified);
    }
    if (idStr === terminalProposalId.toString()) {
      return Promise.resolve(mockTerminal);
    }
    return Promise.resolve(null);
  };

  try {
    // 1. Missing or invalid review decision fields
    {
      const req = {
        params: { id: sandboxFailedProposalId.toString() },
        body: { reviewer: "tester" }, // missing decision
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 400, "Missing decision must return HTTP 400");
      assert.strictEqual(res.body.code, "INVALID_DECISION");
    }

    {
      const req = {
        params: { id: sandboxFailedProposalId.toString() },
        body: { decision: "undecided", reviewer: "tester" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 400, "Unsupported decision must return HTTP 400");
      assert.strictEqual(res.body.code, "INVALID_DECISION");
    }

    // 2. Malformed proposal ID
    {
      const req = {
        params: { id: "not-a-valid-id" },
        body: { decision: "approved" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 400, "Malformed ObjectId must return HTTP 400");
      assert.strictEqual(res.body.code, "INVALID_ID");
    }

    // 3. Unknown proposal ID
    {
      const req = {
        params: { id: nonExistentId.toString() },
        body: { decision: "approved", reviewer: "tester" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 404, "Unknown proposal ID must return HTTP 404");
      assert.strictEqual(res.body.code, "NOT_FOUND");
    }

    // 4. Invalid lifecycle transition: approving a SANDBOX_FAILED proposal
    {
      const req = {
        params: { id: sandboxFailedProposalId.toString() },
        body: { decision: "approved", reviewer: "tester" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 422, "Approval on SANDBOX_FAILED must return HTTP 422");
      assert.strictEqual(res.body.code, "VERIFICATION_REQUIRED");
      assert.strictEqual(mockSandboxFailed.lifecycleState, "SANDBOX_FAILED", "State must remain SANDBOX_FAILED");
      assert.strictEqual(mockSandboxFailed.sandboxResult.status, "FAIL", "Sandbox status must remain FAIL");
    }

    // 5. Valid rejection of a SANDBOX_FAILED proposal
    {
      const req = {
        params: { id: sandboxFailedProposalId.toString() },
        body: { decision: "rejected", reviewer: "senior-reviewer", notes: "Patch failed sandbox verification" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 200, "Rejection on SANDBOX_FAILED must succeed with HTTP 200");
      assert.strictEqual(mockSandboxFailed.lifecycleState, "REJECTED");
      assert.strictEqual(mockSandboxFailed.humanReview.decision, "rejected");
      assert.strictEqual(mockSandboxFailed.humanReview.reviewer, "senior-reviewer");
      // Critical check: sandboxResult remains independent and unmodified!
      assert.strictEqual(mockSandboxFailed.sandboxResult.status, "FAIL", "Human rejection must preserve sandboxResult.status = FAIL");
    }

    // 6. Idempotent repeated review submission
    {
      const req = {
        params: { id: sandboxFailedProposalId.toString() },
        body: { decision: "rejected", reviewer: "senior-reviewer" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 200, "Duplicate identical review must return HTTP 200 idempotently");
      assert.ok(res.body.message.includes("idempotent"), "Response must indicate idempotent handling");
    }

    // 7. Terminal state guard: rejecting an already merged proposal
    {
      const req = {
        params: { id: terminalProposalId.toString() },
        body: { decision: "rejected", reviewer: "tester" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 409, "Reviewing terminal proposal must return HTTP 409");
      assert.strictEqual(res.body.code, "TERMINAL_STATE");
    }

    // 8. Valid approval of a VERIFIED proposal
    {
      const req = {
        params: { id: verifiedProposalId.toString() },
        body: { decision: "approved", reviewer: "senior-reviewer", notes: "Sandbox passed, approved for merge" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 200, "Approval on VERIFIED proposal must succeed with HTTP 200");
      assert.strictEqual(mockVerified.lifecycleState, "APPROVED");
      assert.strictEqual(mockVerified.humanReview.decision, "approved");
      assert.strictEqual(mockVerified.sandboxResult.status, "PASS", "Sandbox status must remain PASS");
    }

    // 9. Normalized legacy 'action' payload ({ action: "reject" })
    {
      const unverified = buildMockProposal("PROPOSED", "NOT_RUN");
      const unverifiedId = new mongoose.Types.ObjectId();
      unverified._id = unverifiedId;

      RepairProposalModel.findById = async (id) => {
        if (id.toString() === unverifiedId.toString()) return unverified;
        return null;
      };

      const req = {
        params: { id: unverifiedId.toString() },
        body: { action: "reject", reviewer: "qa-lead" },
      };
      const res = createMockRes();
      await reviewRepair(req, res);
      assert.strictEqual(res.statusCode, 200, "Normalized action='reject' must succeed");
      assert.strictEqual(unverified.lifecycleState, "REJECTED");
      assert.strictEqual(unverified.humanReview.decision, "rejected");
    }

    // 10. PR creation strictly blocked when proposal is in SANDBOX_FAILED
    {
      RepairProposalModel.findById = async (id) => {
        if (id.toString() === sandboxFailedProposalId.toString()) return mockSandboxFailed;
        return null;
      };

      let thrown = false;
      try {
        await createRepairPullRequest(sandboxFailedProposalId.toString(), "tester");
      } catch (err) {
        thrown = true;
        assert.ok(err.message.includes("Safety guard violation") || err.message.includes("VERIFIED"), "PR creation must throw safety guard violation");
      }
      assert.strictEqual(thrown, true, "createRepairPullRequest must throw for non-verified proposal");

      // Controller PR route test
      const req = {
        params: { id: sandboxFailedProposalId.toString() },
        body: { reviewer: "tester" },
      };
      const res = createMockRes();
      await createPR(req, res);
      assert.strictEqual(res.statusCode, 422, "Controller must return HTTP 422 for blocked PR");
      assert.strictEqual(res.body.code, "PR_CREATION_BLOCKED");
    }
  } finally {
    RepairProposalModel.findById = originalFindById;
    auditService.logAudit = originalLogAudit;
  }

  console.log("  [ok] Repair lifecycle review guards, idempotency, and state separation passed.");
}

module.exports = { testRepairLifecycle };
