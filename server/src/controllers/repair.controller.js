/**
 * repair.controller.js
 * --------------------
 * Express controller for the ETL Repair Lifecycle:
 * - Diagnosing quarantined observations
 * - Executing isolated sandbox verification
 * - Creating verified GitHub Pull Requests
 * - Human approval and rejection workflows with strict guardrails
 */

const mongoose = require("mongoose");
const { RepairProposal, QuarantineRecord } = require("../models");
const { diagnoseAndProposeRepair } = require("../services/repairDiagnosisService");
const { verifyRepairInSandbox } = require("../services/sandboxService");
const { createRepairPullRequest } = require("../services/githubService");
const datasetVersionService = require("../services/datasetVersionService");
const auditService = require("../services/auditService");

async function listRepairs(req, res) {
  try {
    const { state, entityId, limit } = req.query;
    const filter = {};
    if (state) filter.lifecycleState = state;
    if (entityId) filter.entityId = entityId;

    const proposals = await RepairProposal.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 100))
      .lean();

    res.json({ count: proposals.length, proposals });
  } catch (err) {
    console.error("[REFORGE] listRepairs error:", err);
    res.status(500).json({ error: err.message || "Failed to list repair proposals." });
  }
}

async function getRepairDetail(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `Invalid repair proposal ID: "${id}".`, code: "INVALID_ID" });
    }

    const proposal = await RepairProposal.findById(id)
      .populate("quarantineRecordId")
      .populate("rawObservationId")
      .lean();

    if (!proposal) {
      return res.status(404).json({ error: `Repair proposal "${id}" not found.`, code: "NOT_FOUND" });
    }

    res.json({ proposal });
  } catch (err) {
    console.error("[REFORGE] getRepairDetail error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch repair detail." });
  }
}

async function diagnose(req, res) {
  try {
    const { quarantineRecordId, reviewer, mode } = req.body;
    if (!quarantineRecordId) {
      return res.status(400).json({ error: "quarantineRecordId is required.", code: "MISSING_FIELD" });
    }
    if (!mongoose.Types.ObjectId.isValid(quarantineRecordId)) {
      return res.status(400).json({ error: `Invalid quarantineRecordId: "${quarantineRecordId}".`, code: "INVALID_ID" });
    }

    const proposal = await diagnoseAndProposeRepair(quarantineRecordId, reviewer || "engineer", mode || "DATA_REPAIR");
    res.status(201).json({ proposal });
  } catch (err) {
    console.error("[REFORGE] diagnose error:", err);
    res.status(500).json({ error: err.message || "Failed to diagnose failure." });
  }
}

async function executeSandbox(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `Invalid repair proposal ID: "${id}".`, code: "INVALID_ID" });
    }

    const { reviewer } = req.body;
    const proposal = await verifyRepairInSandbox(id, reviewer || "engineer");
    res.json({ proposal });
  } catch (err) {
    console.error("[REFORGE] executeSandbox error:", err);
    res.status(400).json({ error: err.message || "Sandbox verification failed." });
  }
}

async function createPR(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: `Invalid repair proposal ID: "${id}".`, code: "INVALID_ID" });
    }

    const { reviewer } = req.body;
    const proposal = await createRepairPullRequest(id, reviewer || "engineer");
    res.json({ proposal });
  } catch (err) {
    console.error("[REFORGE] createPR error:", err);
    res.status(422).json({ error: err.message || "Failed to create Pull Request.", code: "PR_CREATION_BLOCKED" });
  }
}

/**
 * Reviews a RepairProposal (approve or reject).
 * Supported methods: PATCH, POST
 * Supported payload: { decision: "approved" | "rejected", action?: "approve" | "reject", reviewer?, notes? }
 */
async function reviewRepair(req, res) {
  try {
    const { id } = req.params;
    const { decision, action, reviewer, notes } = req.body;

    // 1. Normalize decision from either 'decision' or 'action'
    let normalizedDecision = decision || (action === "approve" ? "approved" : action === "reject" ? "rejected" : action);
    if (typeof normalizedDecision === "string") {
      normalizedDecision = normalizedDecision.toLowerCase().trim();
    }

    if (!["approved", "rejected"].includes(normalizedDecision)) {
      return res.status(400).json({
        error: `Invalid review decision "${decision || action}". Decision must be 'approved' or 'rejected'.`,
        code: "INVALID_DECISION",
      });
    }

    // 2. Validate proposal ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: `Invalid repair proposal ID format: "${id}".`,
        code: "INVALID_ID",
      });
    }

    const proposal = await RepairProposal.findById(id);
    if (!proposal) {
      return res.status(404).json({
        error: `Repair proposal "${id}" not found.`,
        code: "NOT_FOUND",
      });
    }

    // 3. Idempotency check: if identical decision already recorded on terminal state
    if (
      proposal.humanReview?.decision === normalizedDecision &&
      (proposal.lifecycleState === "APPROVED" || proposal.lifecycleState === "REJECTED")
    ) {
      return res.status(200).json({
        proposal,
        message: `Repair proposal already recorded as ${normalizedDecision.toUpperCase()} (idempotent request).`,
      });
    }

    // 4. State transition guards:
    // If attempting to APPROVE:
    // Strictly requires prior sandbox verification (VERIFIED or PR_CREATED).
    // Approval MUST NOT overwrite or bypass a failed sandbox state!
    if (normalizedDecision === "approved") {
      if (!["VERIFIED", "PR_CREATED", "NEEDS_REVIEW"].includes(proposal.lifecycleState)) {
        return res.status(422).json({
          error: `Cannot approve repair proposal in state "${proposal.lifecycleState}". Patches must pass sandbox verification (VERIFIED) before approval.`,
          code: "VERIFICATION_REQUIRED",
          currentLifecycleState: proposal.lifecycleState,
          sandboxStatus: proposal.sandboxResult?.status || "NOT_RUN",
        });
      }
    }

    // If attempting to REJECT:
    // Allowed for active proposals (including SANDBOX_FAILED, PROPOSED, DETECTED, NEEDS_REVIEW, VERIFIED, PR_CREATED),
    // but blocked if already in terminal post-merge state
    if (normalizedDecision === "rejected") {
      if (["MERGED", "DEPLOYED"].includes(proposal.lifecycleState)) {
        return res.status(409).json({
          error: `Cannot reject repair proposal in terminal state "${proposal.lifecycleState}".`,
          code: "TERMINAL_STATE",
          currentLifecycleState: proposal.lifecycleState,
        });
      }
    }

    // 5. Apply valid review transition
    const nextState = normalizedDecision === "approved" ? "APPROVED" : "REJECTED";
    const prevState = proposal.lifecycleState;

    proposal.lifecycleState = nextState;
    proposal.humanReview = {
      decision: normalizedDecision,
      reviewer: reviewer || "authorized-reviewer",
      reviewedAt: new Date(),
      notes: notes || "",
    };

    proposal.stateHistory.push({
      fromState: prevState,
      toState: nextState,
      actor: reviewer || "authorized-reviewer",
      timestamp: new Date(),
      notes: `Human review decision: ${normalizedDecision.toUpperCase()}. Notes: ${notes || "None"}`,
    });

    await proposal.save();

    // If DATA_REPAIR is approved, mark QuarantineRecord as repaired and apply change to DatasetVersion
    if (normalizedDecision === "approved" && proposal.repairMode === "DATA_REPAIR") {
      try {
        if (proposal.quarantineRecordId) {
          const qRecord = await QuarantineRecord.findById(proposal.quarantineRecordId);
          if (qRecord) {
            qRecord.reviewStatus = "repaired";
            qRecord.reviewer = reviewer || "authorized-reviewer";
            qRecord.reviewNotes = notes || "Approved via automated Data-Level Repair";
            qRecord.reviewedAt = new Date();
            qRecord.correctedValues = {
              value: proposal.dataRepair?.proposedValue,
              strategy: proposal.dataRepair?.repairStrategy,
              previousValue: proposal.dataRepair?.originalValue,
            };
            await qRecord.save();
          }
        }
        await datasetVersionService.applyDataRepairToDatasetVersion({
          proposal,
          actor: reviewer || "authorized-reviewer",
        });
      } catch (applyErr) {
        console.warn("[REFORGE] Failed to update DatasetVersion on approval:", applyErr.message);
      }
    } else if (normalizedDecision === "approved" && proposal.quarantineRecordId) {
      // CODE_PATCH approval
      try {
        const qRecord = await QuarantineRecord.findById(proposal.quarantineRecordId);
        if (qRecord) {
          qRecord.reviewStatus = "approved";
          qRecord.reviewer = reviewer || "authorized-reviewer";
          qRecord.reviewNotes = notes || "Code patch approved";
          qRecord.reviewedAt = new Date();
          await qRecord.save();
        }
      } catch (qErr) {
        console.warn("[REFORGE] Failed to update QuarantineRecord on approval:", qErr.message);
      }
    }

    await auditService.logAudit({
      rawObservationId: proposal.rawObservationId,
      action: normalizedDecision === "approved" ? "repair_approved" : "repair_rejected",
      details: {
        proposalId: proposal._id,
        decision: normalizedDecision,
        repairMode: proposal.repairMode,
        reviewer: proposal.humanReview.reviewer,
        notes,
      },
      actor: proposal.humanReview.reviewer,
    });

    res.status(200).json({ proposal });
  } catch (err) {
    console.error("[REFORGE] reviewRepair error:", err);
    res.status(500).json({ error: err.message || "Failed to record review decision.", code: "INTERNAL_ERROR" });
  }
}

module.exports = {
  listRepairs,
  getRepairDetail,
  diagnose,
  executeSandbox,
  createPR,
  reviewRepair,
};
