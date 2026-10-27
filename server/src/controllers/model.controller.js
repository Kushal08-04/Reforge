/**
 * model.controller.js
 * -------------------
 * Manages ML models registry, training candidate models, promotion, and rollback.
 */

const { ModelVersion, RawObservation, ValidationResult } = require("../models");
const mlClient = require("../services/mlClient");
const { logAudit } = require("../services/auditService");

async function getModels(req, res) {
  try {
    const [mlServiceStatus, dbVersions] = await Promise.all([
      mlClient.listModels(),
      ModelVersion.find().sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      mlServiceStatus,
      registeredVersions: dbVersions,
    });
  } catch (err) {
    console.error("[REFORGE] getModels error:", err);
    res.status(500).json({ error: err.message || "Failed to list models." });
  }
}

async function triggerTraining(req, res) {
  try {
    const { modelType = "isolation_forest", hyperparameters = {}, testSize = 0.25 } = req.body;

    // Gather records from database for training data
    const records = await ValidationResult.find()
      .populate("rawObservationId")
      .limit(500)
      .lean();

    const formattedData = records
      .filter((r) => r.rawObservationId && r.schemaValid)
      .map((r) => ({
        entityId: r.rawObservationId.entityId,
        values: r.rawObservationId.values,
        features: r.features,
        label: r.classification !== "valid" ? 1 : 0,
        isAnomalySeed: r.classification !== "valid",
      }));

    if (formattedData.length < 15) {
      return res.status(400).json({
        error: `Insufficient observations in database to train model (found ${formattedData.length}, minimum 15 required). Run seed or inject dataset first.`,
      });
    }

    const version = `v${Date.now()}`;
    const trainResult = await mlClient.trainModel({
      model_type: modelType,
      version,
      hyperparameters,
      data: formattedData,
      test_size: testSize,
    });

    const newVersion = await ModelVersion.create({
      modelName: trainResult.model_name,
      version: trainResult.model_version,
      algorithm: modelType === "random_forest" ? "RandomForestClassifier" : "IsolationForest",
      status: "candidate",
      hyperparameters,
      metrics: trainResult.metrics,
      trainedOn: {
        datasetVersion: "production-observations",
        sampleCount: formattedData.length,
        testSplitRatio: testSize,
      },
    });

    res.status(201).json({
      message: trainResult.message,
      candidateModel: newVersion,
      metrics: trainResult.metrics,
    });
  } catch (err) {
    console.error("[REFORGE] triggerTraining error:", err);
    res.status(400).json({ error: err.message || "Model training failed." });
  }
}

async function promote(req, res) {
  try {
    const { version } = req.params;
    const { reviewer, modelName } = req.body;

    await mlClient.promoteModel(version, modelName);

    await ModelVersion.updateMany({ status: "active" }, { status: "retired" });
    const updated = await ModelVersion.findOneAndUpdate(
      { version },
      {
        status: "active",
        promotedAt: new Date(),
        promotedBy: reviewer || "authorized-reviewer",
      },
      { new: true }
    );

    res.json({
      status: "promoted",
      activeModel: updated || { version, modelName },
    });
  } catch (err) {
    console.error("[REFORGE] promote error:", err);
    res.status(400).json({ error: err.message || "Model promotion failed." });
  }
}

async function rollback(req, res) {
  try {
    const result = await mlClient.rollbackModel();

    // Revert status in DB
    const activeDoc = await ModelVersion.findOne({ status: "active" });
    if (activeDoc) {
      activeDoc.status = "retired";
      await activeDoc.save();
    }

    const newActiveKey = result.active_model;
    const versionStr = newActiveKey.split(":").pop();
    const newActiveDoc = await ModelVersion.findOneAndUpdate(
      { version: versionStr },
      { status: "active" },
      { new: true }
    );

    res.json({
      status: "rolled_back",
      activeModel: newActiveDoc || { version: versionStr },
    });
  } catch (err) {
    console.error("[REFORGE] rollback error:", err);
    res.status(400).json({ error: err.message || "Model rollback failed." });
  }
}

module.exports = {
  getModels,
  triggerTraining,
  promote,
  rollback,
};
