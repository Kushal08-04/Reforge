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

    ruleRiskScore: { type: Number, min: 0, max: 1, default: null },
    ruleClassification: {
      type: String,
      enum: ["valid", "suspicious", "invalid", "pending"],
      default: "pending",
    },

    // Legacy compatibility field (mirrors ruleRiskScore)
    semanticRiskScore: { type: Number, min: 0, max: 1, default: null },

    // ---- ML Anomaly Detection Output ----
    mlResult: {
      modelName: { type: String, default: "none" },
      modelVersion: { type: String, default: "none" },
      isAnomaly: { type: Boolean, default: false },
      rawScore: { type: Number, default: 0 },
      anomalyScore: { type: Number, min: 0, max: 1, default: 0 },
      status: {
        type: String,
        enum: ["success", "fallback", "skipped", "error"],
        default: "skipped",
      },
      inferenceTimeMs: { type: Number, default: null },
      error: { type: String, default: null },
    },

    // ---- Rule vs ML Comparison ----
    comparisonCategory: {
      type: String,
      enum: [
        "rule_normal_ml_normal",
        "rule_anomaly_ml_anomaly",
        "rule_anomaly_ml_normal",
        "rule_normal_ml_anomaly",
        "not_applicable",
      ],
      default: "not_applicable",
      index: true,
    },

    // ---- Hybrid Decision Layer ----
    hybridClassification: {
      type: String,
      enum: ["valid", "suspicious", "invalid", "pending"],
      default: "pending",
    },

    // Official authoritative classification (backward-compatible field)
    classification: {
      type: String,
      enum: ["valid", "suspicious", "invalid", "pending"],
      default: "pending",
      index: true,
    },

    decisionMode: {
      type: String,
      enum: ["rule_only", "shadow", "hybrid"],
      default: "shadow",
      index: true,
    },

    disagreementReason: { type: String, default: "" },
    decisionPolicyVersion: { type: String, default: "v1.0.0-hybrid" },

    engineVersion: {
      type: String,
      default: () => process.env.SEMANTIC_ENGINE_VERSION || "v0.2.0-hybrid",
    },
    engineMode: {
      type: String,
      enum: ["rule-based", "ml-based", "hybrid"],
      default: "hybrid",
    },

    validatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "validation_results" }
);

module.exports = mongoose.model("ValidationResult", ValidationResultSchema);
