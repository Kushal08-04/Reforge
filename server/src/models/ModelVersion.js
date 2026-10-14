const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * ModelVersion
 * ------------
 * Persisted model registry entry for ML models within the REFORGE ecosystem.
 * Tracks algorithm, training provenance, performance metrics, and lifecycle status.
 */
const ModelVersionSchema = new Schema(
  {
    modelName: { type: String, required: true, index: true },
    version: { type: String, required: true, unique: true, index: true },
    algorithm: {
      type: String,
      enum: ["IsolationForest", "RandomForestClassifier", "Custom"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "candidate", "retired"],
      default: "candidate",
      index: true,
    },
    featureSchemaVersion: { type: String, default: "v1.0.0" },
    hyperparameters: { type: Schema.Types.Mixed, default: {} },
    metrics: {
      tp: Number,
      fp: Number,
      tn: Number,
      fn: Number,
      precision: Number,
      recall: Number,
      f1: Number,
      specificity: Number,
      roc_auc: Number,
      pr_auc: Number,
      baselineSamples: Number,
    },
    trainedOn: {
      datasetVersion: { type: String, default: "synthetic-v1.0.0" },
      sampleCount: { type: Number, default: 0 },
      testSplitRatio: { type: Number, default: 0.25 },
    },
    promotedAt: { type: Date, default: null },
    promotedBy: { type: String, default: null },
  },
  { timestamps: true, collection: "model_versions" }
);

module.exports = mongoose.model("ModelVersion", ModelVersionSchema);
