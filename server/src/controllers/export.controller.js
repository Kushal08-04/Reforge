const { DatasetVersion, RepairProposal, QuarantineRecord } = require("../models");
const datasetVersionService = require("../services/datasetVersionService");
const githubService = require("../services/githubService");

/**
 * Generates a valid binary PDF document conforming to PDF 1.4 specifications.
 * Pure JavaScript implementation with zero external binary dependencies.
 */
function buildPdfReport({ versionId, baseVersion, repairedCount, recordCount, changes = [] }) {
  const lines = [
    "%PDF-1.4",
    "%âãÏÓ",
  ];

  const contentStream = [];
  contentStream.push("BT");
  contentStream.push("/F1 20 Tf");
  contentStream.push("50 750 Td");
  contentStream.push("(REFORGE - Data-Level Repair Audit Report) Tj");

  contentStream.push("/F2 10 Tf");
  contentStream.push("0 -24 Td");
  contentStream.push(`(Generated: ${new Date().toISOString()} | Version: ${versionId} | Base: ${baseVersion}) Tj`);

  contentStream.push("0 -16 Td");
  contentStream.push(`(Total Telemetry Records: ${recordCount} | Repaired Observations: ${repairedCount}) Tj`);

  contentStream.push("0 -20 Td");
  contentStream.push("/F1 12 Tf");
  contentStream.push("(Executive Summary & Mathematical Repair Verification) Tj");

  contentStream.push("/F2 10 Tf");
  contentStream.push("0 -16 Td");
  contentStream.push("(All corrections evaluated via isolated sandbox overlay against semantic rules & ML consensus.) Tj");

  contentStream.push("0 -24 Td");
  contentStream.push("/F1 11 Tf");
  contentStream.push("(Audit Log of Approved Sensor Repairs:) Tj");

  contentStream.push("/F2 9 Tf");
  contentStream.push("0 -16 Td");
  contentStream.push("(Timestamp               | Entity ID       | Original | Repaired | Strategy) Tj");
  contentStream.push("0 -12 Td");
  contentStream.push("(--------------------------------------------------------------------------------------) Tj");

  const sampleChanges = (changes || []).slice(0, 30);
  for (const c of sampleChanges) {
    const ts = c.timestamp ? new Date(c.timestamp).toISOString().slice(0, 19).replace("T", " ") : "2020-07-12 00:00";
    const entity = String(c.entityId || "sensor-0").padEnd(15).slice(0, 15);
    const orig = String(c.originalValue !== undefined ? Number(c.originalValue).toFixed(2) : "N/A").padStart(8);
    const rep = String(c.repairedValue !== undefined ? Number(c.repairedValue).toFixed(2) : "N/A").padStart(8);
    const strat = String(c.strategy || "composite").slice(0, 22);

    contentStream.push("0 -14 Td");
    contentStream.push(`(${ts} | ${entity} | ${orig} | ${rep} | ${strat}) Tj`);
  }

  if (changes.length > 30) {
    contentStream.push("0 -16 Td");
    contentStream.push(`(... and ${changes.length - 30} additional verified observation repairs in dataset snapshot.) Tj`);
  }

  contentStream.push("ET");

  const streamData = contentStream.join("\n");
  const streamLength = Buffer.byteLength(streamData, "utf-8");

  // Objects
  const objects = [];
  // Obj 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  // Obj 2: Pages
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj");
  // Obj 3: Page
  objects.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj");
  // Obj 4: Stream
  objects.push(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamData}\nendstream\nendobj`);
  // Obj 5: Helvetica-Bold
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj");
  // Obj 6: Helvetica
  objects.push("6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj");

  let offset = 0;
  const offsets = [];
  let pdfOutput = lines.join("\n") + "\n";
  offset = Buffer.byteLength(pdfOutput, "utf-8");

  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const objStr = objects[i] + "\n";
    pdfOutput += objStr;
    offset += Buffer.byteLength(objStr, "utf-8");
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  pdfOutput += xref + trailer;

  return Buffer.from(pdfOutput, "utf-8");
}

async function exportDatasetCsv(req, res) {
  try {
    const { versionId, limit } = req.query;
    const records = await datasetVersionService.getCleansedDatasetRecords({
      limit: parseInt(limit, 10) || 50000,
      versionId: versionId || null,
    });

    const headers = ["timestamp", "entityId", "sensorType", "value", "originalValue", "repaired", "repairStrategy"];
    let csv = headers.join(",") + "\n";

    for (const r of records) {
      const ts = r.timestamp ? new Date(r.timestamp).toISOString() : "";
      const entity = r.entityId || "";
      const type = r.features?.type || "";
      const val = r.values?.value !== undefined ? r.values.value : "";
      const origVal = r.originalValue !== undefined ? r.originalValue : val;
      const rep = r.repaired ? "true" : "false";
      const strat = r.repairStrategy || "";

      csv += `"${ts}","${entity}","${type}",${val},${origVal},${rep},"${strat}"\n`;
    }

    const filename = `reforge_cleansed_dataset_${versionId || "latest"}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    console.error("[REFORGE] exportDatasetCsv error:", err);
    res.status(500).json({ error: err.message || "Failed to export CSV." });
  }
}

async function exportRepairReportPdf(req, res) {
  try {
    const { versionId } = req.query;
    const version = versionId
      ? await DatasetVersion.findOne({ versionId }).lean()
      : await datasetVersionService.getCurrentVersion();

    if (!version) {
      return res.status(404).json({ error: "Dataset version not found." });
    }

    const pdfBuffer = buildPdfReport({
      versionId: version.versionId,
      baseVersion: version.baseVersion || "v1.0.0",
      repairedCount: version.repairedCount || version.changes?.length || 0,
      recordCount: version.recordCount || 0,
      changes: version.changes || [],
    });

    const filename = `reforge_repair_report_${version.versionId}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[REFORGE] exportRepairReportPdf error:", err);
    res.status(500).json({ error: err.message || "Failed to generate PDF report." });
  }
}

async function exportDatasetXlsx(req, res) {
  try {
    const { versionId, limit } = req.query;
    const records = await datasetVersionService.getCleansedDatasetRecords({
      limit: parseInt(limit, 10) || 50000,
      versionId: versionId || null,
    });

    let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F766E" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="RepairedRow">
      <Interior ss:Color="#F0FDF4" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Healed Telemetry Dataset">
    <Table>
      <Row ss:StyleID="Header">
        <Cell><Data ss:Type="String">Timestamp</Data></Cell>
        <Cell><Data ss:Type="String">Entity ID</Data></Cell>
        <Cell><Data ss:Type="String">Sensor Type</Data></Cell>
        <Cell><Data ss:Type="String">Healed Value</Data></Cell>
        <Cell><Data ss:Type="String">Original Value</Data></Cell>
        <Cell><Data ss:Type="String">Repaired</Data></Cell>
        <Cell><Data ss:Type="String">Repair Strategy</Data></Cell>
      </Row>`;

    for (const r of records) {
      const ts = r.timestamp ? new Date(r.timestamp).toISOString() : "";
      const entity = String(r.entityId || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const type = String(r.features?.type || "").replace(/&/g, "&amp;");
      const val = r.values?.value !== undefined ? r.values.value : "";
      const origVal = r.originalValue !== undefined ? r.originalValue : val;
      const rep = r.repaired ? "YES" : "NO";
      const strat = String(r.repairStrategy || "").replace(/&/g, "&amp;");
      const rowStyle = r.repaired ? ' ss:StyleID="RepairedRow"' : "";

      xml += `
      <Row${rowStyle}>
        <Cell><Data ss:Type="String">${ts}</Data></Cell>
        <Cell><Data ss:Type="String">${entity}</Data></Cell>
        <Cell><Data ss:Type="String">${type}</Data></Cell>
        <Cell><Data ss:Type="Number">${val}</Data></Cell>
        <Cell><Data ss:Type="Number">${origVal}</Data></Cell>
        <Cell><Data ss:Type="String">${rep}</Data></Cell>
        <Cell><Data ss:Type="String">${strat}</Data></Cell>
      </Row>`;
    }

    xml += `
    </Table>
  </Worksheet>
</Workbook>`;

    const filename = `reforge_healed_dataset_${versionId || "latest"}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(Buffer.from(xml, "utf-8"));
  } catch (err) {
    console.error("[REFORGE] exportDatasetXlsx error:", err);
    res.status(500).json({ error: err.message || "Failed to export Excel spreadsheet." });
  }
}

async function exportDatasetToGitHub(req, res) {
  try {
    const { versionId, commitMessage } = req.body;
    const version = versionId
      ? await DatasetVersion.findOne({ versionId }).lean()
      : await datasetVersionService.getCurrentVersion();

    if (!version) {
      return res.status(404).json({ error: "Dataset version not found." });
    }

    const records = await datasetVersionService.getCleansedDatasetRecords({
      limit: 50000,
      versionId: version.versionId,
    });

    // 1. Build Healed CSV content
    const headers = ["timestamp", "entityId", "sensorType", "healedValue", "originalValue", "repaired", "repairStrategy"];
    let csvContent = headers.join(",") + "\n";
    for (const r of records) {
      const ts = r.timestamp ? new Date(r.timestamp).toISOString() : "";
      const entity = r.entityId || "";
      const type = r.features?.type || "";
      const val = r.values?.value !== undefined ? r.values.value : "";
      const origVal = r.originalValue !== undefined ? r.originalValue : val;
      const rep = r.repaired ? "true" : "false";
      const strat = r.repairStrategy || "";
      csvContent += `"${ts}","${entity}","${type}",${val},${origVal},${rep},"${strat}"\n`;
    }

    // 2. Build Markdown Audit Report content
    const changes = version.changes || [];
    let mdReport = `# REFORGE Healed Dataset Audit Report - Version ${version.versionId}\n\n`;
    mdReport += `**Exported At**: ${new Date().toISOString()}\n`;
    mdReport += `**Base Baseline**: ${version.baseVersion || "v1.0.0"}\n`;
    mdReport += `**Total Records**: ${records.length}\n`;
    mdReport += `**Total Observations Repaired**: ${version.repairedCount || changes.length}\n\n`;
    mdReport += `## Executive Summary\n`;
    mdReport += `All repaired observations were processed through REFORGE's isolated sandbox cascade validation loop until their newly evaluated semantic & ML risk scores dropped below **0.30**.\n\n`;
    mdReport += `## Healed Observations Audit Log\n\n`;
    mdReport += `| Timestamp | Sensor Entity | Original Value | Healed Value | Repair Strategy | Applied By |\n`;
    mdReport += `|---|---|---|---|---|---|\n`;
    for (const c of changes.slice(0, 50)) {
      const ts = c.timestamp ? new Date(c.timestamp).toISOString() : "";
      const entity = c.entityId || "";
      const orig = c.originalValue !== undefined ? c.originalValue : "N/A";
      const rep = c.repairedValue !== undefined ? c.repairedValue : "N/A";
      const strat = c.strategy || "cascade_optimal";
      const by = c.appliedBy || "auto-healer";
      mdReport += `| ${ts} | \`${entity}\` | ${orig} | **${rep}** | \`${strat}\` | ${by} |\n`;
    }
    if (changes.length > 50) {
      mdReport += `\n*... and ${changes.length - 50} additional observation repairs recorded in dataset snapshot.* \n`;
    }

    // 3. Commit files into datasets/ folder in configured GitHub repo
    const commitMsg = commitMessage || `chore(datasets): export healed dataset ${version.versionId} with ${version.repairedCount || changes.length} verified repairs`;
    const filesToCommit = [
      {
        path: `datasets/reforge_healed_${version.versionId}.csv`,
        content: csvContent,
      },
      {
        path: `datasets/reforge_repair_audit_report_${version.versionId}.md`,
        content: mdReport,
      },
      {
        path: `datasets/reforge_healed_${version.versionId}.json`,
        content: JSON.stringify(
          {
            versionId: version.versionId,
            baseVersion: version.baseVersion,
            recordCount: records.length,
            repairedCount: version.repairedCount || changes.length,
            exportedAt: new Date().toISOString(),
            changes: version.changes,
          },
          null,
          2
        ),
      },
    ];

    const commitResults = [];
    for (const file of filesToCommit) {
      const resFile = await githubService.commitFileToGitHub({
        path: file.path,
        content: file.content,
        message: `${commitMsg} [${file.path}]`,
      });
      commitResults.push(resFile);
    }

    res.json({
      success: true,
      repo: githubService.GITHUB_REPO,
      branch: githubService.GITHUB_BASE_BRANCH,
      commitMessage: commitMsg,
      filesCommitted: commitResults,
      summary: {
        versionId: version.versionId,
        recordCount: records.length,
        repairedCount: version.repairedCount || changes.length,
      },
    });
  } catch (err) {
    console.error("[REFORGE] exportDatasetToGitHub error:", err);
    res.status(500).json({ error: err.message || "Failed to export dataset to GitHub." });
  }
}

async function listVersions(req, res) {
  try {
    const versions = await DatasetVersion.find().sort({ createdAt: -1 }).lean();
    res.json({ count: versions.length, versions });
  } catch (err) {
    console.error("[REFORGE] listVersions error:", err);
    res.status(500).json({ error: err.message || "Failed to list dataset versions." });
  }
}

async function createSnapshot(req, res) {
  try {
    const { versionId, description, reviewer } = req.body;
    if (!versionId) {
      return res.status(400).json({ error: "versionId is required." });
    }
    const newVersion = await datasetVersionService.createVersionSnapshot(
      versionId,
      description,
      reviewer || "engineer"
    );
    res.status(201).json({ version: newVersion });
  } catch (err) {
    console.error("[REFORGE] createSnapshot error:", err);
    res.status(500).json({ error: err.message || "Failed to create dataset snapshot." });
  }
}

module.exports = {
  exportDatasetCsv,
  exportDatasetXlsx,
  exportRepairReportPdf,
  exportDatasetToGitHub,
  listVersions,
  createSnapshot,
  buildPdfReport,
};
