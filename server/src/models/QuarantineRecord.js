const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * QuarantineRecord
 * ----------------
 * Created whenever a ValidationResult classifies an observation as
 * "suspicious" or "invalid". Represents the human review workflow.
 * Corrections do NOT overwrite the raw observation.
 */
const QuarantineRecordSchema = new Schema(
  {
    rawObservationId: {
      type: Schema.Types.ObjectId,
      ref: "RawObservation",
      required: true,
      index: true,
    },
    validationResultId: {
      type: Schema.Types.ObjectId,
      ref: "ValidationResult",
      required: true,
      index: true,
    },

    // Denormalized fields for fast list-view rendering without extra joins
    entityId: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true },
    classification: {
      type: String,
      enum: ["suspicious", "invalid"],
      required: true,
      index: true,
    },
    semanticRiskScore: { type: Number, default: null },
    ruleRiskScore: { type: Number, default: null },
    mlAnomalyScore: { type: Number, default: null },
    comparisonCategory: { type: String, default: null },
    repairProposalId: {
      type: Schema.Types.ObjectId,
      ref: "RepairProposal",
      default: null,
    },

    reviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "corrected", "repaired"],
      default: "pending",
      index: true,
    },

    correctedValues: { type: Schema.Types.Mixed, default: null },
    reviewer: { type: String, default: null },
    reviewNotes: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "quarantine_records" }
);

module.exports = mongoose.model("QuarantineRecord", QuarantineRecordSchema);
