const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * ValidationResult
 * ----------------
 * Outcome of running a RawObservation through:
 *   1) structural (schema) validation
 *   2) semantic feature construction
 *   3) rule-based semantic engine
 */
const ValidationResultSchema = new Schema(
  {
    rawObservationId: {
      type: Schema.Types.ObjectId,
      ref: "RawObservation",
      required: true,
      index: true,
    },

    // ---- Structural / conventional validation ----
    schemaValid: { type: Boolean, default: null },
    schemaErrors: { type: [String], default: [] },

    // ---- Semantic feature snapshot ----
    features: { type: Schema.Types.Mixed, default: {} },

    // ---- Semantic engine output ----
    evidence: [
      {
        source: { type: String, required: true }, // e.g. "rateOfChangeRule"
        triggered: { type: Boolean, required: true },
        severity: { type: Number, min: 0, max: 1, default: 0 },
        message: { type: String, default: "" },
        details: { type: Schema.Types.Mixed, default: {} },
      },
    ],

    semanticRiskScore: { type: Number, min: 0, max: 1, default: null },

    classification: {
      type: String,
      enum: ["valid", "suspicious", "invalid", "pending"],
      default: "pending",
      index: true,
    },

    engineVersion: {
      type: String,
      default: () => process.env.SEMANTIC_ENGINE_VERSION || "unversioned",
    },
    engineMode: {
      type: String,
      enum: ["rule-based", "ml-based", "hybrid"],
      default: "rule-based",
    },

    validatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "validation_results" }
);

module.exports = mongoose.model("ValidationResult", ValidationResultSchema);
