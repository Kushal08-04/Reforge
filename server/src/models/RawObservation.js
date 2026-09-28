const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * RawObservation
 * ----------------
 * The immutable, untouched record of what a source actually sent.
 * This collection is NEVER mutated by validation/correction logic.
 * Every other collection references back to a RawObservation by its _id.
 */
const RawObservationSchema = new Schema(
  {
    sourceId: { type: String, required: true, index: true },
    sourceType: {
      type: String,
      enum: ["sensor", "api", "file", "database", "manual", "other"],
      default: "sensor",
    },
    // entityId format used by this MVP: "<zone>-<type>", e.g. "zone-a-temperature"
    // This lets the feature builder group entities by zone (historical context)
    // and by type across zones (cross-sensor context) without extra config.
    entityId: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    // Primary numeric reading plus optional secondary fields
    values: { type: Schema.Types.Mixed, required: true },
    units: { type: Schema.Types.Mixed, default: {} },
    rawPayload: { type: Schema.Types.Mixed, required: true },
    ingestKey: { type: String, required: true, unique: true, index: true },
    ingestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "raw_observations" }
);

module.exports = mongoose.model("RawObservation", RawObservationSchema);
