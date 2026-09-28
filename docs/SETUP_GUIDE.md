# REFORGE — Setup Guide (MVP)

This gets the full backend + frontend running locally, seeds a realistic
synthetic dataset with labelled anomalies, and walks through the demo flow.

## Prerequisites

- Node.js v18+ (v20/v22 both fine)
- npm
- A free MongoDB Atlas account: https://www.mongodb.com/cloud/atlas/register

## 1. Create your MongoDB Atlas cluster

1. Create a free-tier (M0) cluster.
2. **Database Access** → create a database user (username/password).
3. **Network Access** → add your current IP (or `0.0.0.0/0` for local dev).
4. **Connect → Drivers** → copy the connection string and add a database
   name to the path, e.g.:
   ```
   mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/reforge?retryWrites=true&w=majority
   ```

## 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` and paste your real `MONGODB_URI`. Leave the other defaults as-is
for a first run:

```
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/reforge?retryWrites=true&w=majority
SEMANTIC_ENGINE_VERSION=v0.2.0-rules
RISK_THRESHOLD_SUSPICIOUS=0.3
RISK_THRESHOLD_INVALID=0.6
CORS_ORIGIN=http://localhost:5173
```

Verify the connection works:

```bash
npm run verify
```

You should see `[REFORGE] Checkpoint PASSED.` If it fails, check the
troubleshooting table at the bottom of this guide.

Start the backend:

```bash
npm run dev
```

Confirm it's up:

```bash
curl http://localhost:5000/api/health
```

## 3. Seed the demo dataset

This is the fastest way to see REFORGE actually working end-to-end, without
needing to hand-craft ingest payloads. It generates 216 synthetic
multi-sensor readings (9 sensors across 3 zones × 3 types) with 10 labelled
semantic anomalies injected, and runs every one of them through the real
validation pipeline:

```bash
# still inside server/
npm run seed
```

Expected tail of output:

```
[REFORGE] Seeding complete.
  Total records:        216
  Classified valid:     ...
  Classified suspicious:...
  Classified invalid:   ...
  Ground-truth labels written to: .../scripts/output/labels.json

  Run "npm run evaluate" to compare classifications against ground truth.
```

Then check how well the rule engine did against the known-injected
anomalies:

```bash
npm run evaluate
```

This prints precision/recall/F1 and a per-anomaly-type breakdown — this is
the research/evaluation angle described in the project handoff (Section 10).

**Re-running the demo from scratch?** Use `npm run seed -- --reset` to wipe
all REFORGE collections before reseeding.

## 4. Frontend setup

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`). You should
see:

- **Overview** — total ingested, valid/suspicious/invalid counts, a
  classification bar chart, per-entity health table, and recent events.
- **Quarantine** — the review queue, filterable by status. Click into any
  record to see:
  - the flagged value and its risk score
  - the evidence explaining exactly which rule(s) fired and why
  - recent history for that entity
  - Approve / Reject / Correct actions
  - a link through to that record's full audit trail

`.env`'s `VITE_API_BASE_URL` must point at your running backend
(`http://localhost:5000/api` by default).

## 5. Sending your own data (optional)

You can also POST observations directly instead of using the seed script:

```bash
curl -X POST http://localhost:5000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "manual-test",
    "sourceType": "manual",
    "entityId": "zone-a-temperature",
    "timestamp": "2026-09-10T12:00:00.000Z",
    "values": { "value": 26.4 },
    "units": { "value": "C" }
  }'
```

Batch ingestion is supported by wrapping records in `{ "records": [...] }`.

`entityId` should follow the `<zone>-<type>` convention (e.g.
`zone-b-humidity`) if you want cross-sensor comparison to work — see
`docs/ARCHITECTURE.md` for why.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `MONGODB_URI is not set` | `.env` missing/placeholder | Re-check step 2 |
| `MongoServerError: bad auth` | Wrong Atlas credentials | Re-copy from Atlas, URL-encode special characters in the password |
| Connection times out | IP not whitelisted | Atlas → Network Access → add your IP |
| Frontend shows "Failed to load dashboard" | Backend not running, or wrong `VITE_API_BASE_URL` | Confirm `npm run dev` is running in `server/` and `.env` in `frontend/` points at it |
| CORS error in browser console | `CORS_ORIGIN` in server `.env` doesn't match frontend URL | Set it to `http://localhost:5173` (or your actual frontend origin) |
| Quarantine queue looks empty | Nothing flagged yet | Run `npm run seed` — the injected anomalies guarantee some flagged records |
| `EADDRINUSE` on port 5000 | Something else is using it | Change `PORT` in `server/.env` |

## Tuning the semantic engine

- Rule thresholds live in `server/src/services/ruleEngine.js`
  (`Z_SCORE_THRESHOLD`, `CROSS_SENSOR_THRESHOLD`, etc.)
- Rule weights and classification cutoffs live in
  `server/src/services/scoringEngine.js` and `RISK_THRESHOLD_*` in `.env`

After changing either, re-run `npm run seed -- --reset` and `npm run evaluate`
to see the effect on precision/recall.
