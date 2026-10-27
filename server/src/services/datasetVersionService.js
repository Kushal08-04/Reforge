const { DatasetVersion, RawObservation, QuarantineRecord } = require("../models");
const auditService = require("./auditService");

/**
 * datasetVersionService.js
 * -------------------------
 * Manages versioned dataset snapshots and human-approved data repair applications.
 * REFORGE treats raw observations as immutable; repairs are maintained as
 * versioned overlays on top of the raw telemetry stream.
 */

async function getCurrentVersion() {
  let version = await DatasetVersion.findOne({ status: "active" }).sort({ createdAt: -1 });
  if (!version) {
    const rawCount = await RawObservation.countDocuments();
    const quarantinedCount = await QuarantineRecord.countDocuments({ reviewStatus: "pending" });
    version = await DatasetVersion.create({
      versionId: "v1.0.0",
      baseVersion: "v1.0.0",
      recordCount: rawCount,
      repairedCount: 0,
      quarantinedCount,
      status: "active",
      description: "Initial IoT telemetry dataset baseline",
      changes: [],
    });
  }
  return version;
}

async function applyDataRepairToDatasetVersion({ proposal, actor = "engineer" }) {
  const version = await getCurrentVersion();
  const rawId = proposal.rawObservationId;

  // Check if this observation has already been repaired in the active version
  const existingChange = (version.changes || []).find(
    (c) => c.rawObservationId && c.rawObservationId.toString() === rawId.toString()
  );

  const changeData = {
    rawObservationId: rawId,
    entityId: proposal.entityId,
    timestamp: proposal.evidence?.timestamp || new Date(),
    originalValue: proposal.dataRepair?.originalValue,
    repairedValue: proposal.dataRepair?.proposedValue,
    strategy: proposal.dataRepair?.repairStrategy || "composite_optimal",
    quarantineRecordId: proposal.quarantineRecordId,
    repairProposalId: proposal._id,
    appliedAt: new Date(),
    appliedBy: actor,
  };

  if (existingChange) {
    Object.assign(existingChange, changeData);
  } else {
    version.changes.push(changeData);
    version.repairedCount = version.changes.length;
  }

  // Update counts
  const rawCount = await RawObservation.countDocuments();
  const quarantinedCount = await QuarantineRecord.countDocuments({ reviewStatus: "pending" });
  version.recordCount = rawCount;
  version.quarantinedCount = quarantinedCount;

  await version.save();

  await auditService.logAudit({
    rawObservationId: rawId,
    action: "dataset_version_updated",
    details: {
      versionId: version.versionId,
      repairedCount: version.repairedCount,
      change: changeData,
    },
    actor,
  });

  return version;
}

async function createVersionSnapshot(newVersionId, description = "", actor = "engineer") {
  const current = await getCurrentVersion();
  current.status = "archived";
  await current.save();

  const rawCount = await RawObservation.countDocuments();
  const quarantinedCount = await QuarantineRecord.countDocuments({ reviewStatus: "pending" });

  const newVersion = await DatasetVersion.create({
    versionId: newVersionId,
    baseVersion: current.versionId,
    recordCount: rawCount,
    repairedCount: current.changes.length,
    quarantinedCount,
    changes: current.changes,
    status: "active",
    description: description || `Snapshot ${newVersionId} derived from ${current.versionId}`,
  });

  await auditService.logAudit({
    action: "dataset_version_created",
    details: {
      newVersionId,
      baseVersion: current.versionId,
      repairedCount: newVersion.repairedCount,
    },
    actor,
  });

  return newVersion;
}

/**
 * Returns cleansed records by overlaying approved repairs onto raw observations.
 */
async function getCleansedDatasetRecords({ limit = 5000, versionId = null } = {}) {
  const version = versionId
    ? await DatasetVersion.findOne({ versionId }).lean()
    : await getCurrentVersion();

  const repairMap = new Map();
  if (version && Array.isArray(version.changes)) {
    for (const change of version.changes) {
      if (change.rawObservationId) {
        repairMap.set(change.rawObservationId.toString(), change);
      }
    }
  }

  const rawRecords = await RawObservation.find()
    .sort({ timestamp: 1 })
    .limit(limit)
    .lean();

  return rawRecords.map((r) => {
    const rawIdStr = r._id.toString();
    const repair = repairMap.get(rawIdStr);
    if (repair) {
      return {
        ...r,
        values: {
          ...r.values,
          value: repair.repairedValue,
        },
        repaired: true,
        originalValue: repair.originalValue,
        repairStrategy: repair.strategy,
        repairedAt: repair.appliedAt,
        repairedBy: repair.appliedBy,
      };
    }
    return {
      ...r,
      repaired: false,
    };
  });
}

module.exports = {
  getCurrentVersion,
  applyDataRepairToDatasetVersion,
  createVersionSnapshot,
  getCleansedDatasetRecords,
};
