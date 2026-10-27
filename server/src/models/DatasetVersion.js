const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * DatasetVersion
 * --------------
 * Tracks immutable snapshots of the versioned, cleansed dataset.
 * When a Data-Level Repair is approved by a human engineer, the correction
 * is recorded here as an approved delta without mutating the immutable raw observation.
 */
const DatasetVersionChangeSchema = new Schema(
  {
    rawObservationId: { type: Schema.Types.ObjectId, ref: "RawObservation", required: true },
    entityId: { type: String, required: true },
    timestamp: { type: Date, required: true },
    originalValue: { type: Schema.Types.Mixed },
    repairedValue: { type: Number, required: true },
    strategy: { type: String, default: "composite_optimal" },
    quarantineRecordId: { type: Schema.Types.ObjectId, ref: "QuarantineRecord" },
    repairProposalId: { type: Schema.Types.ObjectId, ref: "RepairProposal" },
    appliedAt: { type: Date, default: Date.now },
    appliedBy: { type: String, default: "engineer" },
  },
  { _id: true }
);

const DatasetVersionSchema = new Schema(
  {
    versionId: { type: String, required: true, unique: true, index: true },
    baseVersion: { type: String, default: "v1.0.0" },
    recordCount: { type: Number, default: 0 },
    repairedCount: { type: Number, default: 0 },
    quarantinedCount: { type: Number, default: 0 },
    changes: [DatasetVersionChangeSchema],
    status: {
      type: String,
      enum: ["active", "archived", "draft"],
      default: "active",
      index: true,
    },
    description: { type: String, default: "Versioned IoT telemetry dataset" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "dataset_versions" }
);

module.exports = mongoose.model("DatasetVersion", DatasetVersionSchema);
