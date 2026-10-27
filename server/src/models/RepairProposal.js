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

    repairMode: {
      type: String,
      enum: ["DATA_REPAIR", "CODE_PATCH"],
      default: "DATA_REPAIR",
      index: true,
    },

    dataRepair: {
      repairStrategy: {
        type: String,
        enum: [
          "historical_interpolation",
          "rolling_statistical_estimation",
          "peer_consensus_estimation",
          "physical_boundary_clamp",
          "composite_optimal",
        ],
        default: "composite_optimal",
      },
      originalValue: { type: Schema.Types.Mixed },
      proposedValue: { type: Number },
      confidenceScore: { type: Number, default: 0.95 },
      estimationDetails: { type: Schema.Types.Mixed, default: {} },
      alternativeCandidates: [{ type: Schema.Types.Mixed }],
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
      applicationState: {
        type: String,
        enum: ["PENDING", "APPLIED", "FAILED"],
        default: "PENDING",
      },
    },

    risksAndAssumptions: [{ type: String }],
    testsRequired: [{ type: String }],

    sandboxResult: {
      status: {
        type: String,
        enum: ["NOT_RUN", "RUNNING", "PASS", "FAIL", "NEEDS_HUMAN_REVIEW", "EXECUTION_ERROR", "UNAVAILABLE"],
        default: "NOT_RUN",
      },
      executedAt: { type: Date, default: null },
      containerId: { type: String, default: null },
      runtimeIsolation: { type: String, default: "docker_container" },
      workingDirectory: { type: String, default: null },
      commandExecuted: { type: String, default: null },
      exitCode: { type: Number, default: null },
      executionTimeMs: { type: Number, default: 0 },
      timeoutMs: { type: Number, default: 15000 },
      stdout: { type: String, default: "" },
      stderr: { type: String, default: "" },
      testsPassed: { type: Number, default: 0 },
      testsTotal: { type: Number, default: 0 },
      testResults: { type: Schema.Types.Mixed, default: [] },
      correctedValue: { type: Number, default: null },
      semanticChecksPassed: { type: Boolean, default: false },
      semanticMetrics: { type: Schema.Types.Mixed, default: {} },
      cleanupResult: { type: Boolean, default: true },
      failureReason: { type: String, default: null },
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
