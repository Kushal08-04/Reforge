const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * RepairProposal
 * --------------
 * Full lifecycle tracking for automated diagnosis and agentic ETL repairs.
 *
 * State Machine:
 *   DETECTED -> DIAGNOSING -> PROPOSED -> SANDBOX_RUNNING ->
 *   (SANDBOX_FAILED | VERIFIED) -> NEEDS_REVIEW -> PR_CREATED ->
 *   (APPROVED | REJECTED) -> (MERGED | DEPLOYED)
 */
const RepairProposalSchema = new Schema(
  {
    quarantineRecordId: {
      type: Schema.Types.ObjectId,
      ref: "QuarantineRecord",
      required: true,
      index: true,
    },
    rawObservationId: {
      type: Schema.Types.ObjectId,
      ref: "RawObservation",
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },

    failureCategory: {
      type: String,
      enum: [
        "schema_drift",
        "type_mismatch",
        "null_explosion",
        "missing_required_field",
        "implausible_jump",
        "historical_drift",
        "cross_sensor_inconsistency",
        "unit_calibration_error",
        "transformation_error",
        "unknown",
      ],
      default: "unknown",
    },

    rootCauseHypothesis: { type: String, default: "" },
    evidence: { type: Schema.Types.Mixed, default: {} },

    proposedPatch: {
      targetFile: { type: String, default: "pipeline/transform.js" },
      patchType: {
        type: String,
        enum: ["code_fix", "schema_mapping", "calibration_offset", "outlier_clamp", "guard_clause"],
        default: "guard_clause",
      },
      diff: { type: String, default: "" },
      description: { type: String, default: "" },
      codeBefore: { type: String, default: "" },
      codeAfter: { type: String, default: "" },
    },

    risksAndAssumptions: [{ type: String }],
    testsRequired: [{ type: String }],

    sandboxResult: {
      status: {
        type: String,
        enum: ["NOT_RUN", "RUNNING", "PASS", "FAIL", "NEEDS_HUMAN_REVIEW", "EXECUTION_ERROR"],
        default: "NOT_RUN",
      },
      executedAt: { type: Date, default: null },
      containerId: { type: String, default: null },
      executionTimeMs: { type: Number, default: 0 },
      stdout: { type: String, default: "" },
      stderr: { type: String, default: "" },
      testsPassed: { type: Number, default: 0 },
      testsTotal: { type: Number, default: 0 },
      semanticChecksPassed: { type: Boolean, default: false },
      semanticMetrics: { type: Schema.Types.Mixed, default: {} },
    },

    githubIntegration: {
      branchName: { type: String, default: null },
      commitSha: { type: String, default: null },
      prNumber: { type: Number, default: null },
      prUrl: { type: String, default: null },
      ciStatus: { type: String, default: "pending" },
      createdAt: { type: Date, default: null },
    },

    lifecycleState: {
      type: String,
      enum: [
        "DETECTED",
        "DIAGNOSING",
        "PROPOSED",
        "SANDBOX_RUNNING",
        "SANDBOX_FAILED",
        "VERIFIED",
        "NEEDS_REVIEW",
        "PR_CREATED",
        "CI_FAILED",
        "APPROVED",
        "REJECTED",
        "MERGED",
        "DEPLOYED",
      ],
      default: "DETECTED",
      index: true,
    },

    stateHistory: [
      {
        fromState: { type: String },
        toState: { type: String },
        actor: { type: String, default: "system" },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: "" },
      },
    ],

    humanReview: {
      decision: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      reviewer: { type: String, default: null },
      reviewedAt: { type: Date, default: null },
      notes: { type: String, default: "" },
    },
  },
  { timestamps: true, collection: "repair_proposals" }
);

module.exports = mongoose.model("RepairProposal", RepairProposalSchema);
