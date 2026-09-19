# FraudGuard

A real-time fraud detection system: transactions come in over an API, get queued,
scored by an XGBoost model, and — if flagged — pushed live to an analyst dashboard
for a human decision, with SHAP-based explanations for every score.

## Live demo

**[fraudguard-web.onrender.com](https://fraudguard-web.onrender.com)**

| | |
|---|---|
| Email | `demo.analyst@fraudguard.app` |
| Password | `FraudGuardDemo2026!` |

This account has the `analyst` role (review queue + decisions only, no user
management), logging into a review queue pre-seeded with real scored
transactions — some flagged and blocked, some allowed — so there's something
to look at immediately.

Hosted on Render's free tier, so the backend services spin down after 15
minutes idle; the first request after a lull takes ~30-60s to wake back up
before the dashboard loads.

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
(e.g. Render, Railway), `api` and `worker` use `REDIS_URL`/`MYSQL_URL` in place
of the individual host/port/credential variables when those are set, and
negotiate TLS automatically for managed providers that require it (see
`MYSQL_CA_CERT` below) — see each service's source for the exact fallback
behavior.

| Service | Key variables |
|---|---|
| api | `PORT`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `INGEST_API_KEY`, `MYSQL_HOST`/`MYSQL_URL`, `MYSQL_CA_CERT` (optional CA pinning), `REDIS_HOST`/`REDIS_URL` |
| worker | `WORKER_ID`, `SCORING_SERVICE_URLS`, `DASHBOARD_ORIGIN`, `SOCKET_PORT`/`PORT`, `MYSQL_HOST`/`MYSQL_URL`, `MYSQL_CA_CERT`, `REDIS_HOST`/`REDIS_URL` |
| scoring-service | model path/version config, `PORT` |
| web (build-time) | `VITE_API_URL`, `VITE_SOCKET_URL` |

## Deployment

The live demo above runs on free-tier infrastructure with no cost and no
trial expiration:

- **Render** — `render.yaml` blueprints all four services: `api`, `worker`,
  and `scoring-service` as free Docker web services, `web` as a free static
  site. Push to `main` and Render redeploys automatically. Note:
  `staticPublishPath` for a static site is relative to that service's
  `rootDir`, not the repo root, despite what Render's own schema docs say.
- **Aiven** — free-forever managed MySQL (1GB). Requires TLS; `api`/`worker`
  negotiate it automatically off `MYSQL_URL`, with optional CA pinning via
  `MYSQL_CA_CERT`.
- **Upstash** — free-forever serverless Redis. Confirmed compatible with
  BullMQ's blocking commands (worth re-checking if you swap providers — not
  all serverless Redis offerings support them).

Two setup steps aren't automated by the blueprint and need to be run once
against a fresh database:

```bash
# schema
mysql --ssl-mode=REQUIRED -h <host> -P <port> -u <user> -p <db> < db/migrations/001_accounts.sql
# ...through db/migrations/013_add_timestamp_precision.sql

# admin user (reads ADMIN_EMAIL/ADMIN_PASSWORD from the environment)
cd api && node scripts/seed-admin.js
```

The `model_versions` table also needs at least one row matching the scoring
service's `MODEL_VERSION` string (see `scoring-service/main.py`) before the
worker can resolve a scored transaction to a model version — jobs fail into
`failed_transactions` until this row exists:

```sql
INSERT INTO model_versions (version, is_active, trained_at)
VALUES ('v1-scale0.1x-threshold0.35', TRUE, NOW());
```

## Model

The scoring service wraps an XGBoost model (current version
`v1-scale0.1x-threshold0.35`) trained on transaction features (type, amount,
account/destination balances before and after, and whether the destination
balance was zeroed out — a strong fraud signal in the training data). The
decision threshold was tuned against precision/recall trade-offs during
development; see `model-training/` for the EDA, threshold sweep, and training
scripts used to produce it.

## Load testing

`load-test/` has a k6 script for ingest throughput (`ingest-test.js`) and a
Node script that queries MySQL for end-to-end scoring latency
(`measure-scoring-latency.js`).

```bash
cd load-test
k6 run -e INGEST_API_KEY=<key> ingest-test.js
node measure-scoring-latency.js --minutes 5
```

Results from a run against the full Docker Compose stack on a single machine
(20 virtual users sustained, 5% fraud-shaped / 95% benign transaction mix,
2-minute run):

| Metric | Result |
|---|---|
| Requests | 1,817 total, 0 failed (`status 202`), 0 dead-lettered |
| Sustained throughput | ~15 req/s |
| Ingest response time (`POST /transactions/ingest`) | avg 3.65 ms · p95 6.01 ms · p99 7.21 ms · max 15.84 ms |
| End-to-end scoring latency (ingest → worker → scoring-service → DB write) | avg 4.2 ms · p95 5.0 ms · max 465 ms |

The ingest endpoint stays fast under load because it only validates and enqueues
— it never waits on the model. The single high-outlier (465 ms max) on the
scoring side lines up with the initial ramp-up burst, not a steady-state issue.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: lint + build checks
for each of the four services, plus a Docker build check (build-only, no push)
for every image.
