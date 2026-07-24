# FraudGuard

A real-time fraud detection system: transactions come in over an API, get queued,
scored by an XGBoost model, and — if flagged — pushed live to an analyst dashboard
for a human decision, with SHAP-based explanations for every score.

## Architecture

```
                    ┌──────────────┐
  POST /ingest ───▶ │   api        │──▶ MySQL (transactions, users, audit log)
  (API key +        │  (Express)   │──▶ Redis (BullMQ queue)
  idempotency key)  └──────────────┘
                                             │
                                             ▼
                                     ┌──────────────┐        ┌──────────────────┐
                                     │   worker      │──────▶│  scoring-service  │
                                     │  (BullMQ)     │◀──────│  (FastAPI/XGBoost)│
                                     └──────────────┘        └──────────────────┘
                                             │
                              writes risk_scores, then on decision=block:
                                             │
                                             ▼
                                     Socket.io "new-alert" ──▶  web (React dashboard)
                                     (Redis adapter fan-out)     live review queue
```

- **api** — Express REST API: transaction ingest, auth (JWT + RBAC), the review
  queue, and analyst review actions. Talks to MySQL directly and enqueues scoring
  jobs onto a BullMQ/Redis queue.
- **worker** — BullMQ consumer. Pulls a job, calls **scoring-service**, persists the
  transaction + risk score to MySQL, and — for anything the model decides to
  `block` — broadcasts a live alert over Socket.io (with a Redis adapter, so any
  number of horizontally-scaled worker instances fan out to every connected
  dashboard, not just the one that processed the job).
- **scoring-service** — FastAPI service wrapping a trained XGBoost model. Scores a
  transaction, returns a probability, a block/allow decision against a tuned
  threshold, and SHAP values for every feature so the decision is explainable.
- **web** — React + Vite dashboard. JWT-authenticated analyst review queue with
  live Socket.io alerts, per-transaction SHAP breakdowns, score/type filters, and
  a dark/light theme.
- **MySQL** — transactions, accounts, merchants, model versions, risk scores,
  users, analyst reviews, audit log, and a dead-letter table for jobs that
  exhaust their retries.
- **Redis** — BullMQ's queue backend and the Socket.io adapter's pub/sub layer.

## Features

- **Idempotent ingest** — every transaction requires an `Idempotency-Key` header;
  a retried request never double-processes.
- **Queue hardening** — automatic retry with backoff, and a dead-letter table for
  jobs that fail all attempts, so nothing silently vanishes.
- **Explainable scoring** — every risk score carries per-feature SHAP values, shown
  in the dashboard as a diverging bar chart, not just a bare probability.
- **JWT auth + RBAC** — `analyst` and `admin` roles; only admins can create users.
- **Live alerts** — new blocked transactions appear in every connected analyst's
  queue in real time via Socket.io, with a Redis adapter so this holds under
  horizontal worker scaling.
- **Audit log** — every analyst decision (confirmed fraud / false positive /
  escalated) is recorded.
- **Dockerized** — all four services run via a single `docker-compose.yml` with
  healthcheck-gated startup ordering.
- **CI** — GitHub Actions lints/builds each service and does a Docker build check
  on every push/PR to `main`.

## Running locally

Requires Docker and Docker Compose.

```bash
docker compose up --build
```

This starts MySQL, Redis, and all four app services. Once everything reports
healthy:

| Service | URL |
|---|---|
| Dashboard | http://localhost:8080 |
| API | http://localhost:4000 |
| Worker (Socket.io) | http://localhost:4001 |
| Scoring service | http://localhost:8000 |

Apply the schema before first use:

```bash
mysql -h 127.0.0.1 -P 3306 -uroot -pdevpassword fraudguard < db/migrations/001_accounts.sql
# ...repeat in order through db/migrations/013_add_timestamp_precision.sql
```

### Running the web dashboard outside Docker (dev mode)

For frontend work with hot reload, run the Vite dev server against the
Dockerized backend instead of rebuilding the `web` image on every change:

```bash
cd web
npm install
npm run dev   # http://localhost:5173
```

`web/.env` should point at the Dockerized backend:

```
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4001
```

### Scaling the worker/scoring tier

```bash
docker compose up --scale worker=3 --scale scoring-service=3
```

(Requires removing the fixed host port mappings on `worker` and `scoring-service`
in `docker-compose.yml` first, since Compose can't bind multiple replicas to the
same fixed host port.)

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/transactions/ingest` | API key + `Idempotency-Key` header | Queue a transaction for scoring |
| POST | `/auth/login` | — | Get a JWT |
| POST | `/users` | JWT, `admin` role | Create an analyst/admin user |
| GET | `/review-queue` | JWT | List pending (blocked, unreviewed) transactions |
| POST | `/transactions/:id/review` | JWT | Record an analyst's decision on a transaction |
| GET | `/health` | — | Health check |

## Environment variables

Each service reads from its own `.env` for local dev (see `docker-compose.yml`
for the values used when running the full stack in Docker). In production
(e.g. Railway), `api` and `worker` will use `REDIS_URL`/`MYSQL_URL` in place of
the individual host/port/credential variables if those are set — see each
service's source for the exact fallback behavior.

| Service | Key variables |
|---|---|
| api | `PORT`, `JWT_SECRET`, `MYSQL_HOST`/`MYSQL_URL`, `REDIS_HOST`/`REDIS_URL`, API key(s) for ingest |
| worker | `WORKER_ID`, `SCORING_SERVICE_URLS`, `DASHBOARD_ORIGIN`, `SOCKET_PORT`, `MYSQL_HOST`/`MYSQL_URL`, `REDIS_HOST`/`REDIS_URL` |
| scoring-service | model path/version config |
| web (build-time) | `VITE_API_URL`, `VITE_SOCKET_URL` |

## Model

The scoring service wraps an XGBoost model (current version
`v1-scale0.1x-threshold0.35`) trained on transaction features (type, amount,
account/destination balances before and after, and whether the destination
balance was zeroed out — a strong fraud signal in the training data). The
decision threshold was tuned against precision/recall trade-offs during
development; see `model-training/` for the EDA, threshold sweep, and training
scripts used to produce it.

## Load testing

`load-test/` has k6 scripts for ingest throughput (`ingest-test.js`) and
scoring-service latency (`measure-scoring-latency.js`) under load.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: lint + build checks
for each of the four services, plus a Docker build check (build-only, no push)
for every image.
