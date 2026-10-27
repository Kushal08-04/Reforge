import { useState } from "react";
import Papa from "papaparse";
import Modal from "../common/Modal";
import { ingestTelemetry } from "../../api/endpoints";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

export default function IngestModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("single"); // "single" | "file"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Single record state
  const [entityId, setEntityId] = useState("zone-a-temperature");
  const [value, setValue] = useState("72.8");
  const [unit, setUnit] = useState("C");

  // File upload state
  const [fileName, setFileName] = useState("");
  const [parsedRecords, setParsedRecords] = useState([]);

  function resetForm() {
    setError("");
    setSuccessMsg("");
    setFileName("");
    setParsedRecords([]);
  }

  async function handleSingleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const payload = {
        sourceId: `manual-ui-${Date.now()}`,
        sourceType: "sensor",
        entityId,
        timestamp: new Date().toISOString(),
        values: { value: parseFloat(value) },
        units: { value: unit },
      };
      const res = await ingestTelemetry(payload);
      setSuccessMsg(`Observation ingested successfully! Classification: ${res.classification.toUpperCase()} (Risk Score: ${res.semanticRiskScore ?? "0.00"})`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to ingest record.");
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    resetForm();
    setFileName(file.name);

    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "json") {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const json = JSON.parse(evt.target.result);
          const records = Array.isArray(json) ? json : json.records || [json];
          setParsedRecords(records);
        } catch {
          setError("Invalid JSON format.");
        }
      };
      reader.readAsText(file);
    } else if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const mapped = results.data.map((row) => ({
            sourceId: row.source_id || row.sourceId || `file-${Date.now()}`,
            entityId: row.sensor_id || row.entityId || "zone-a-temperature",
            timestamp: row.timestamp || new Date().toISOString(),
            values: { value: Number(row.value) },
            units: { value: row.unit || "C" },
          }));
          setParsedRecords(mapped);
        },
        error: (err) => setError(`CSV Parsing error: ${err.message}`),
      });
    } else {
      setError("Supported file types are .csv and .json.");
    }
  }

  async function handleBatchSubmit() {
    if (!parsedRecords.length) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await ingestTelemetry({ records: parsedRecords });
      setSuccessMsg(`Batch of ${parsedRecords.length} observations ingested successfully!`);
      setParsedRecords([]);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to ingest batch.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inject Telemetry Dataset">
      {/* Tab Switcher */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
        <button
          onClick={() => { setActiveTab("single"); resetForm(); }}
          className={`btn btn-sm ${activeTab === "single" ? "btn-primary" : "btn-secondary"}`}
        >
          Single Sensor Injection
        </button>
        <button
          onClick={() => { setActiveTab("file"); resetForm(); }}
          className={`btn btn-sm ${activeTab === "file" ? "btn-primary" : "btn-secondary"}`}
        >
          Batch Dataset Upload (.csv, .json)
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", backgroundColor: "var(--accent-error-bg)", border: "1px solid var(--accent-error)", borderRadius: "var(--radius-sm)", color: "var(--accent-error)", fontSize: "12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div style={{ padding: "8px 12px", backgroundColor: "var(--accent-verified-bg)", border: "1px solid var(--accent-verified)", borderRadius: "var(--radius-sm)", color: "var(--accent-verified)", fontSize: "12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
          <CheckCircle size={14} />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === "single" ? (
        <form onSubmit={handleSingleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
              Entity Identifier (&lt;zone&gt;-&lt;modality&gt;)
            </label>
            <select
              className="select"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="zone-a-temperature">zone-a-temperature</option>
              <option value="zone-a-humidity">zone-a-humidity</option>
              <option value="zone-b-temperature">zone-b-temperature</option>
              <option value="zone-b-pressure">zone-b-pressure</option>
              <option value="zone-c-temperature">zone-c-temperature</option>
              <option value="zone-c-co">zone-c-co</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Observed Sensor Value
              </label>
              <input
                type="number"
                step="any"
                className="input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                style={{ width: "100%", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Unit
              </label>
              <input
                type="text"
                className="input"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={{ width: "100%", fontFamily: "var(--font-mono)" }}
              />
            </div>
          </div>

          <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0" }}>
            Tip: Setting value to 72°C for zone-a-temperature will trigger Rate-of-Change, Z-Score, and Implausible Jump rules.
          </p>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? "Processing Pipeline..." : "Ingest & Validate"}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              border: "2px dashed var(--border-color)",
              borderRadius: "var(--radius-sm)",
              padding: "24px",
              textAlign: "center",
              cursor: "pointer",
            }}
            onClick={() => document.getElementById("dataset-file-input").click()}
          >
            <Upload size={24} style={{ color: "var(--text-muted)", margin: "0 auto 8px" }} />
            <p style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
              {fileName ? fileName : "Click to select CSV or JSON dataset"}
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
              Expected columns: sensor_id, timestamp, value, unit
            </p>
            <input
              id="dataset-file-input"
              type="file"
              accept=".csv,.json"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </div>

          {parsedRecords.length > 0 && (
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Ready to stream <strong>{parsedRecords.length}</strong> records into REFORGE.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleBatchSubmit}
              disabled={loading || !parsedRecords.length}
              className="btn btn-primary"
            >
              {loading ? "Ingesting Batch..." : `Ingest ${parsedRecords.length} Records`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
