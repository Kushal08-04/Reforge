/**
 * repair.controller.js
 * --------------------
 * Express controller for the ETL Repair Lifecycle:
 * - Diagnosing quarantined observations
 * - Executing isolated sandbox verification
 * - Creating verified GitHub Pull Requests
 * - Human approval and rejection workflows
 */

const { RepairProposal } = require("../models");
const { diagnoseAndProposeRepair } = require("../services/repairDiagnosisService");
const { verifyRepairInSandbox } = require("../services/sandboxService");
const { createRepairPullRequest } = require("../services/githubService");
const { logAudit } = require("../services/auditService");

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
    const proposal = await RepairProposal.findById(req.params.id)
      .populate("quarantineRecordId")
      .populate("rawObservationId")
      .lean();

    if (!proposal) {
      return res.status(404).json({ error: "Repair proposal not found." });
    }

    res.json({ proposal });
  } catch (err) {
    console.error("[REFORGE] getRepairDetail error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch repair detail." });
  }
}

async function diagnose(req, res) {
  try {
    const { quarantineRecordId, reviewer } = req.body;
    if (!quarantineRecordId) {
      return res.status(400).json({ error: "quarantineRecordId is required." });
    }

    const proposal = await diagnoseAndProposeRepair(quarantineRecordId, reviewer || "engineer");
    res.status(201).json({ proposal });
  } catch (err) {
    console.error("[REFORGE] diagnose error:", err);
    res.status(500).json({ error: err.message || "Failed to diagnose failure." });
  }
}

async function executeSandbox(req, res) {
  try {
    const { reviewer } = req.body;
    const proposal = await verifyRepairInSandbox(req.params.id, reviewer || "engineer");
    res.json({ proposal });
  } catch (err) {
    console.error("[REFORGE] executeSandbox error:", err);
    res.status(400).json({ error: err.message || "Sandbox verification failed." });
  }
}

async function createPR(req, res) {
  try {
    const { reviewer } = req.body;
    const proposal = await createRepairPullRequest(req.params.id, reviewer || "engineer");
    res.json({ proposal });
  } catch (err) {
    console.error("[REFORGE] createPR error:", err);
    res.status(400).json({ error: err.message || "Failed to create Pull Request." });
  }
}

async function reviewRepair(req, res) {
  try {
    const { decision, reviewer, notes } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "Decision must be 'approved' or 'rejected'." });
    }

    const proposal = await RepairProposal.findById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: "Repair proposal not found." });
    }

    if (!["VERIFIED", "PR_CREATED", "NEEDS_REVIEW"].includes(proposal.lifecycleState)) {
      return res.status(400).json({
        error: `Cannot review proposal in state "${proposal.lifecycleState}". Must be VERIFIED or PR_CREATED.`,
      });
    }

    const nextState = decision === "approved" ? "APPROVED" : "REJECTED";
    const prevState = proposal.lifecycleState;

    proposal.lifecycleState = nextState;
    proposal.humanReview = {
      decision,
      reviewer: reviewer || "authorized-reviewer",
      reviewedAt: new Date(),
      notes: notes || "",
    };

    proposal.stateHistory.push({
      fromState: prevState,
      toState: nextState,
      actor: reviewer || "authorized-reviewer",
      timestamp: new Date(),
      notes: `Human review decision: ${decision.toUpperCase()}. Notes: ${notes || "None"}`,
    });

    await proposal.save();

    await logAudit({
      rawObservationId: proposal.rawObservationId,
      action: decision === "approved" ? "repair_approved" : "repair_rejected",
      details: {
        proposalId: proposal._id,
        decision,
        reviewer: proposal.humanReview.reviewer,
        notes,
      },
      actor: proposal.humanReview.reviewer,
    });

    res.json({ proposal });
  } catch (err) {
    console.error("[REFORGE] reviewRepair error:", err);
    res.status(500).json({ error: err.message || "Failed to record review decision." });
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
