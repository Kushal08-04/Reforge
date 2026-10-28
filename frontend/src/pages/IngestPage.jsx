import { useState } from "react";
import Papa from "papaparse";
import apiClient from "../api/client";

function normalizeRecord(record = {}, index = 0, allRecords = []) {
  if (!record || typeof record !== "object") {
    record = {};
  }

  // Case-insensitive key lookup helper
  const findKey = (candidates) => {
    const keys = Object.keys(record);
    for (const cand of candidates) {
      const found = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
      if (found && record[found] !== undefined && record[found] !== null && String(record[found]).trim() !== "") {
        return record[found];
      }
    }
    return undefined;
  };

  const findKeyName = (candidates) => {
    const keys = Object.keys(record);
    for (const cand of candidates) {
      const found = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
      if (found && record[found] !== undefined && record[found] !== null && String(record[found]).trim() !== "") {
        return found.trim().toLowerCase();
      }
    }
    return undefined;
  };

  // 1. Timestamp extraction & generic synthesis
  let timestamp = findKey([
    "timestamp", "ts", "time", "datetime", "date",
    "event_time", "recorded_at", "created_at", "epoch", "clock"
  ]);
  let parsedDate = null;
  if (timestamp !== undefined && timestamp !== null) {
    if (typeof timestamp === "number" || (!isNaN(Number(timestamp)) && String(timestamp).trim() !== "")) {
      const numTs = Number(timestamp);
      parsedDate = numTs > 1e11 ? new Date(numTs) : new Date(numTs * 1000);
    } else {
      parsedDate = new Date(timestamp);
    }
  }
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    const totalCount = allRecords?.length || 1000;
    parsedDate = new Date(Date.now() - (totalCount - index) * 5000);
  }

  // 2. Entity ID / Device ID extraction & generic synthesis
  let entityId = findKey([
    "entityId", "entity_id", "device", "deviceId", "device_id",
    "sensor", "sensorId", "sensor_id", "station", "station_id",
    "node", "node_id", "id", "mac", "source"
  ]);
  if (!entityId) {
    const sensorName = findKeyName(["temperature", "temp", "humidity", "hum", "co", "smoke", "lpg", "ph", "electrical_conductivity", "pressure"]);
    entityId = sensorName ? `generic-sensor-${sensorName}` : "generic-iot-sensor";
  } else {
    entityId = String(entityId).trim();
  }


  // 3. Source ID & Type
  let sourceId = findKey(["sourceId", "source_id", "source", "dataset", "file"]) || `uploaded-dataset-${Date.now()}`;
  let sourceType = record.sourceType || "file";

  // 4. Values extraction (multi-sensor & single-sensor support)
  const values = typeof record.values === "object" && record.values !== null
    ? { ...record.values }
    : {};

  // Extract all numeric columns present at root of record into values
  const knownEnvelopeKeys = new Set(["sourceId", "sourceType", "entityId", "timestamp", "values", "units", "rawPayload", "ingestKey", "_id", "__v"]);
  for (const [k, v] of Object.entries(record)) {
    if (!knownEnvelopeKeys.has(k) && v !== undefined && v !== null && v !== "") {
      const num = Number(v);
      if (!isNaN(num)) {
        values[k] = num;
      }
    }
  }

  // Determine primary numeric value
  let primaryValue = values.value;
  if (typeof primaryValue !== "number" || isNaN(primaryValue)) {
    const rootVal = findKey([
      "value", "val", "reading", "temperature", "temp",
      "humidity", "hum", "co", "smoke", "lpg", "ph",
      "electrical_conductivity", "pressure", "light", "motion"
    ]);
    if (rootVal !== undefined && !isNaN(Number(rootVal))) {
      primaryValue = Number(rootVal);
    } else {
      for (const [k, v] of Object.entries(values)) {
        if (typeof v === "number" && !isNaN(v)) {
          primaryValue = v;
          break;
        }
      }
    }
  }

  values.value = typeof primaryValue === "number" && !isNaN(primaryValue) ? primaryValue : 0.0;

  // 5. Units synthesis
  const units = typeof record.units === "object" && record.units !== null
    ? { ...record.units }
    : {};
  if (!units.value) {
    const rawUnit = findKey(["unit", "units"]);
    if (rawUnit) {
      units.value = String(rawUnit);
    } else {
      const entLower = String(entityId).toLowerCase();
      if (entLower.includes("temp")) units.value = "C";
      else if (entLower.includes("hum")) units.value = "%";
      else if (entLower.includes("co") || entLower.includes("lpg") || entLower.includes("smoke")) units.value = "ppm";
      else if (entLower.includes("ph")) units.value = "pH";
      else if (entLower.includes("conduct")) units.value = "mS/cm";
      else if (entLower.includes("press")) units.value = "hPa";
      else units.value = "units";
    }
  }

  return {
    sourceId: String(sourceId),
    sourceType: String(sourceType),
    entityId: String(entityId),
    timestamp: parsedDate.toISOString(),
    values,
    units,
  };
}

export default function IngestPage() {
  const [file, setFile] = useState(null);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    setError("");
    setStatus("");
    setResult(null);
    setRecords([]);

    if (!selectedFile) return;

    const extension = selectedFile.name.split(".").pop().toLowerCase();

    if (!["csv", "json"].includes(extension)) {
      setError("Please select a CSV or JSON file.");
      return;
    }

    setFile(selectedFile);

    if (extension === "json") {
      parseJson(selectedFile);
    } else {
      parseCsv(selectedFile);
    }
  }

  function parseJson(selectedFile) {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);

        const data = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.records)
            ? parsed.records
            : [parsed];

        const normalized = data.map((r, i, arr) => normalizeRecord(r, i, arr));

        validateRecords(normalized);
      } catch {
        setError("Invalid JSON file.");
      }
    };

    reader.readAsText(selectedFile);
  }

  function parseCsv(selectedFile) {
    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,

      complete: (results) => {
        if (results.errors.length) {
          setError(
            `CSV parsing failed: ${results.errors[0].message}`
          );
          return;
        }

        const normalized = results.data.map((r, i, arr) => normalizeRecord(r, i, arr));

        validateRecords(normalized);
      },

      error: (err) => {
        setError(`CSV parsing failed: ${err.message}`);
      },
    });
  }

  function validateRecords(data) {
    if (!data || !data.length) {
      setError("Dataset is empty. No valid records found.");
      return;
    }

    setError("");
    setRecords(data);
    setStatus(
      `Ready for injection: ${data.length} records parsed and generically normalized for self-healing.`
    );
  }

  async function injectDataset() {
    if (!records.length) return;

    setLoading(true);
    setError("");
    setStatus("Injecting dataset into REFORGE...");
    setResult(null);

    try {
      const BATCH_SIZE = 200;
      const totalBatches = Math.ceil(records.length / BATCH_SIZE);
      let allResults = [];

      for (let b = 0; b < totalBatches; b++) {
        const chunk = records.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        if (totalBatches > 1) {
          setStatus(
            `Injecting batch ${b + 1} of ${totalBatches} (${Math.round(((b + 1) / totalBatches) * 100)}%)...`
          );
        }

        const response = await apiClient.post("/ingest", {
          records: chunk,
        });

        const data = response.data;
        if (Array.isArray(data?.results)) {
          allResults = allResults.concat(data.results);
        } else if (data) {
          allResults.push(data);
        }
      }

      setResult({ count: allResults.length, results: allResults });
      setStatus(
        `Successfully injected ${records.length} record(s). Observations flagged for self-healing are available in Quarantine.`
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.message ||
        "Dataset injection failed."
      );
      setStatus("");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="page">
      <h1 className="page-title">Dataset Injection</h1>

      <p className="muted">
        Upload a CSV or JSON dataset and run it through the
        REFORGE semantic validation pipeline.
      </p>

      <div className="card">
        <h2 className="card-title">Upload Dataset</h2>

        <div className="form-row">
          <label htmlFor="dataset-file">
            Dataset file
          </label>

          <input
            id="dataset-file"
            className="input"
            type="file"
            accept=".csv,.json"
            onChange={handleFileChange}
          />
        </div>

        {file && (
          <p className="muted">
            Selected: <strong>{file.name}</strong>
          </p>
        )}

        {status && (
          <p className="muted">
            {status}
          </p>
        )}

        {error && (
          <p className="error-text">
            {error}
          </p>
        )}

        <div className="action-row">
          <button
            className="btn btn-neutral"
            onClick={injectDataset}
            disabled={!records.length || loading}
          >
            {loading ? "Injecting..." : "Inject Dataset"}
          </button>
        </div>
      </div>

      {records.length > 0 && (
        <div className="card">
          <h2 className="card-title">
            Dataset Preview
          </h2>

          <p className="muted">
            {records.length} records detected.
          </p>

          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Entity</th>
                  <th>Timestamp</th>
                  <th>Value</th>
                  <th>Unit</th>
                </tr>
              </thead>

              <tbody>
                {records.slice(0, 10).map((record, index) => (
                  <tr key={index}>
                    <td>{record.sourceId}</td>
                    <td>{record.entityId}</td>
                    <td>{record.timestamp}</td>
                    <td>{record.values.value}</td>
                    <td>{record.units.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {records.length > 10 && (
            <p className="muted">
              Showing first 10 records.
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="card">
          <h2 className="card-title">
            Injection Results
          </h2>

          <p>
            Processed:{" "}
            <strong>
              {result.count ?? records.length}
            </strong>
          </p>

          {Array.isArray(result.results) && (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Classification</th>
                    <th>Risk Score</th>
                    <th>Quarantined</th>
                  </tr>
                </thead>

                <tbody>
                  {result.results.map((item) => (
                    <tr key={item.rawObservationId}>
                      <td>{item.entityId}</td>
                      <td>{item.classification}</td>
                      <td>
                        {item.semanticRiskScore?.toFixed?.(2) ??
                          item.semanticRiskScore}
                      </td>
                      <td>
                        {item.quarantined ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}