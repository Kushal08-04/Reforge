const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * AuditLog
 * ----------------
 * Append-only lineage trail. Every meaningful state change in the pipeline
 * writes an entry here so the full history of a record can be reconstructed.
 */
const AuditLogSchema = new Schema(
  {
    rawObservationId: {
      type: Schema.Types.ObjectId,
      ref: "RawObservation",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        "ingested",
        "schema_validated",
        "semantic_validated",
        "ml_evaluated",
        "quarantined",
        "review_approved",
        "review_rejected",
        "review_corrected",
        "repair_diagnosed",
        "sandbox_started",
        "sandbox_verified",
        "sandbox_failed",
        "pr_created",
        "model_trained",
        "model_promoted",
        "model_rolled_back",
      ],
      required: true,
    },
    details: { type: Schema.Types.Mixed, default: {} },
    actor: { type: String, default: "system" },
    engineVersion: {
      type: String,
      default: () => process.env.SEMANTIC_ENGINE_VERSION || "unversioned",
    },
  },
  { timestamps: true, collection: "audit_logs" }
);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
