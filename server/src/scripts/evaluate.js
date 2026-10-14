/**
 * evaluate.js
 * ----------------
 * Evaluates REFORGE's Rule-Based, ML-Based, and Hybrid validation
 * engines against ground-truth labels and reports:
 *   - Confusion Matrix (TP, FP, TN, FN)
 *   - Precision, Recall, F1, Specificity
 *   - Performance by Anomaly Type
 *   - Rule vs ML Agreement & Disagreement rates
 *
 * Usage: npm run evaluate
 */

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { runEvaluationBenchmark } = require("../services/evaluationBenchmarkService");

async function run() {
  await connectDB();

  console.log("\n========================================================");
  console.log(" REFORGE Comparative Validation Evaluation Benchmark");
  console.log("========================================================\n");

  try {
    const report = await runEvaluationBenchmark();

    console.log(`Evaluated ${report.datasetSize} labelled observations.\n`);

    console.log("--- 1. RULE-BASED ENGINE BASELINE ---");
    console.log(`  TP: ${report.ruleMetrics.tp} | FP: ${report.ruleMetrics.fp} | TN: ${report.ruleMetrics.tn} | FN: ${report.ruleMetrics.fn}`);
    console.log(`  Precision:   ${(report.ruleMetrics.precision * 100).toFixed(1)}%`);
    console.log(`  Recall:      ${(report.ruleMetrics.recall * 100).toFixed(1)}%`);
    console.log(`  F1-Score:    ${report.ruleMetrics.f1.toFixed(3)}`);
    console.log(`  Specificity: ${(report.ruleMetrics.specificity * 100).toFixed(1)}%\n`);

    console.log("--- 2. ML ANOMALY DETECTION (ISOLATION FOREST) ---");
    console.log(`  TP: ${report.mlMetrics.tp} | FP: ${report.mlMetrics.fp} | TN: ${report.mlMetrics.tn} | FN: ${report.mlMetrics.fn}`);
    console.log(`  Precision:   ${(report.mlMetrics.precision * 100).toFixed(1)}%`);
    console.log(`  Recall:      ${(report.mlMetrics.recall * 100).toFixed(1)}%`);
    console.log(`  F1-Score:    ${report.mlMetrics.f1.toFixed(3)}`);
    console.log(`  Specificity: ${(report.mlMetrics.specificity * 100).toFixed(1)}%\n`);

    console.log("--- 3. CALIBRATED HYBRID POLICY ---");
    console.log(`  TP: ${report.hybridMetrics.tp} | FP: ${report.hybridMetrics.fp} | TN: ${report.hybridMetrics.tn} | FN: ${report.hybridMetrics.fn}`);
    console.log(`  Precision:   ${(report.hybridMetrics.precision * 100).toFixed(1)}%`);
    console.log(`  Recall:      ${(report.hybridMetrics.recall * 100).toFixed(1)}%`);
    console.log(`  F1-Score:    ${report.hybridMetrics.f1.toFixed(3)}`);
    console.log(`  Specificity: ${(report.hybridMetrics.specificity * 100).toFixed(1)}%\n`);

    console.log("--- 4. RULE VS ML AGREEMENT ANALYSIS ---");
    console.log(`  Consensus Normal (Both Normal):        ${report.agreementStats.bothNormal}`);
    console.log(`  Consensus Anomaly (Both Anomaly):      ${report.agreementStats.bothAnomaly}`);
    console.log(`  Rule Flagged / ML Normal:              ${report.agreementStats.ruleAnomalyMlNormal}`);
    console.log(`  ML Flagged / Rule Normal:              ${report.agreementStats.ruleNormalMlAnomaly}`);
    console.log(`  Overall Agreement Rate:                ${(report.agreementStats.agreementRate * 100).toFixed(1)}%`);
    console.log(`  Disagreement Rate:                     ${(report.agreementStats.disagreementRate * 100).toFixed(1)}%\n`);

    console.log("--- 5. DETECTION RATE BY ANOMALY TYPE (HYBRID) ---");
    for (const [type, stats] of Object.entries(report.hybridMetrics.byType)) {
      console.log(`  ${type.padEnd(28)}: ${stats.caught}/${stats.total} (${(stats.rate * 100).toFixed(0)}%)`);
    }

    console.log("\n[REFORGE] Benchmark successfully saved to MongoDB collection 'evaluation_runs'.\n");
  } catch (err) {
    console.error("[REFORGE] Evaluation benchmark failed:", err.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
