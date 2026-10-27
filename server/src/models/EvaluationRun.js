const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * EvaluationRun
 * -------------
 * Persisted record of an evaluation benchmark comparing Rule-only, ML-only,
 * and Hybrid validation performance on a labelled dataset.
 */
const EvaluationRunSchema = new Schema(
  {
    datasetVersion: { type: String, required: true },
    datasetSize: { type: Number, required: true },
    splitStrategy: { type: String, default: "held-out-evaluation" },
    modelVersion: { type: String, default: "active" },
    decisionMode: { type: String, default: "hybrid" },

    ruleMetrics: {
      tp: Number,
      fp: Number,
      tn: Number,
      fn: Number,
      precision: Number,
      recall: Number,
      f1: Number,
      specificity: Number,
      fpr: Number,
      byType: Schema.Types.Mixed,
    },

    mlMetrics: {
      tp: Number,
      fp: Number,
      tn: Number,
      fn: Number,
      precision: Number,
      recall: Number,
      f1: Number,
      specificity: Number,
      fpr: Number,
      roc_auc: Number,
      pr_auc: Number,
      byType: Schema.Types.Mixed,
    },

    hybridMetrics: {
      tp: Number,
      fp: Number,
      tn: Number,
      fn: Number,
      precision: Number,
      recall: Number,
      f1: Number,
      specificity: Number,
      fpr: Number,
      byType: Schema.Types.Mixed,
    },

    agreementStats: {
      total: Number,
      bothNormal: Number,
      bothAnomaly: Number,
      ruleAnomalyMlNormal: Number,
      ruleNormalMlAnomaly: Number,
      agreementRate: Number,
      disagreementRate: Number,
    },

    latencyMetrics: {
      avgInferenceMs: Number,
      memoryMb: Number,
      mlFailures: Number,
    },

    evaluatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "evaluation_runs" }
);

module.exports = mongoose.model("EvaluationRun", EvaluationRunSchema);
