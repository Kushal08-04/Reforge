/**
 * repairDiagnosisService.js
 * -------------------------
 * Analyzes quarantined anomalies and ETL failures, generates evidence-linked
 * root-cause diagnoses, and creates structured repair proposals.
 */

const {
  QuarantineRecord,
  RawObservation,
  ValidationResult,
  RepairProposal,
} = require("../models");
const llmProvider = require("./llmProvider");
const { logAudit } = require("./auditService");

async function diagnoseAndProposeRepair(quarantineRecordId, actor = "system") {
  const quarantineRecord = await QuarantineRecord.findById(quarantineRecordId);
  if (!quarantineRecord) {
    throw new Error(`Quarantine record ${quarantineRecordId} not found.`);
  }

  const [rawObservation, validationResult, history] = await Promise.all([
    RawObservation.findById(quarantineRecord.rawObservationId).lean(),
    ValidationResult.findById(quarantineRecord.validationResultId).lean(),
    RawObservation.find({
      entityId: quarantineRecord.entityId,
      timestamp: { $lte: quarantineRecord.timestamp },
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean(),
  ]);

  if (!rawObservation || !validationResult) {
    throw new Error("Missing underlying observation or validation result.");
  }

  // Generate structured diagnosis and repair via LLM provider
  const diagnosis = await llmProvider.generateDiagnosisAndRepair({
    entityId: quarantineRecord.entityId,
    observation: rawObservation,
    validationResult,
    history,
  });

  // Create persisted RepairProposal
  const proposal = await RepairProposal.create({
    quarantineRecordId: quarantineRecord._id,
    rawObservationId: rawObservation._id,
    entityId: quarantineRecord.entityId,
    failureCategory: diagnosis.failureCategory,
    rootCauseHypothesis: diagnosis.rootCauseHypothesis,
    evidence: {
      ruleRiskScore: validationResult.ruleRiskScore,
      ruleClassification: validationResult.ruleClassification,
      triggeredRules: (validationResult.evidence || [])
        .filter((e) => e.triggered)
        .map((e) => ({ source: e.source, severity: e.severity, message: e.message })),
      mlResult: validationResult.mlResult,
      comparisonCategory: validationResult.comparisonCategory,
      rawReading: rawObservation.values?.value,
      timestamp: rawObservation.timestamp,
    },
    proposedPatch: {
      targetFile: diagnosis.targetFile,
      patchType: diagnosis.patchType,
      diff: diagnosis.diff,
      description: diagnosis.description,
      codeBefore: diagnosis.codeBefore,
      codeAfter: diagnosis.codeAfter,
    },
    risksAndAssumptions: diagnosis.risksAndAssumptions,
    testsRequired: diagnosis.testsRequired,
    lifecycleState: "PROPOSED",
    stateHistory: [
      {
        fromState: "DETECTED",
        toState: "PROPOSED",
        actor,
        timestamp: new Date(),
        notes: `Diagnosed as ${diagnosis.failureCategory} with automated ${diagnosis.patchType} proposal.`,
      },
    ],
  });

  // Link proposal back to QuarantineRecord
  quarantineRecord.repairProposalId = proposal._id;
  await quarantineRecord.save();

  await logAudit({
    rawObservationId: rawObservation._id,
    action: "repair_diagnosed",
    details: {
      repairProposalId: proposal._id,
      failureCategory: diagnosis.failureCategory,
      patchType: diagnosis.patchType,
      targetFile: diagnosis.targetFile,
    },
    actor,
  });

  return proposal;
}

module.exports = { diagnoseAndProposeRepair };
