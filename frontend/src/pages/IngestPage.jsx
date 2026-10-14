import { useState } from "react";
import Papa from "papaparse";
import apiClient from "../api/client";

function normalizeRecord(record, index) {
  return {
    sourceId: String(record.sourceId || `uploaded-dataset-${Date.now()}`),
    sourceType: record.sourceType || "file",
    entityId: String(record.entityId || ""),
    timestamp: record.timestamp,
    values: {
      value: Number(
        record.value ??
        record?.values?.value
      ),
    },
    units: {
      value: record.unit ?? record?.units?.value ?? "",
    },
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

        const normalized = data.map(normalizeRecord);

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

        const normalized = results.data.map(normalizeRecord);

        validateRecords(normalized);
      },

      error: (err) => {
        setError(`CSV parsing failed: ${err.message}`);
      },
    });
  }

  function validateRecords(data) {
    const invalidRows = data.filter(
      (record) =>
        !record.entityId ||
        !record.timestamp ||
        !Number.isFinite(record.values.value)
    );

    if (invalidRows.length) {
      setError(
        `${invalidRows.length} record(s) are missing entityId, timestamp, or numeric value.`
      );
      return;
    }

    setRecords(data);
    setStatus(`${data.length} records ready for injection.`);
  }

  async function injectDataset() {
    if (!records.length) return;

    setLoading(true);
    setError("");
    setStatus("Injecting dataset into REFORGE...");
    setResult(null);

    try {
      const response = await apiClient.post("/ingest", {
        records,
      });

      const data = response.data;

      setResult(data);

      setStatus(
        `Successfully injected ${records.length} record(s).`
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