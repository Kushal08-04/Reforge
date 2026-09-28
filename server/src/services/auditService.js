const { AuditLog } = require("../models");

/**
 * Writes one append-only audit log entry. Never call update/delete on
 * AuditLog elsewhere in the codebase - this collection is write-once.
 */
async function logAudit({ rawObservationId, action, details = {}, actor = "system" }) {
  return AuditLog.create({ rawObservationId, action, details, actor });
}

module.exports = { logAudit };
