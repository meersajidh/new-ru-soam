# 11a.6 — Identity Service GCP Deploy Runbook

Reproducible steps to stand up the `server/identity` service on GCP (Cloud Run,
`asia-south1`, India/DPDP residency). Phase 11a.6-b infra. Captured 2026-06-15
from the first deploy of project `project-caa58028-c0e1-4be8-909`.

**Prereqs:** `gcloud` CLI authed (`gcloud auth login` + `gcloud auth
application-default login`), a GCP project with billing, `psql` + `go` locally.

All vars come from a sourced env file — see `gcp.env.example`. Copy it to
`gcp.env` (gitignored via `server/.gitignore` `*.env`), fill the secrets, and
`source server/deploy/prod/gcp.env` once per shell. It self-derives
`PROJECT_ID`/`REGION` from the active gcloud config.

The code half (11a.6-a — `KMSSigner`, signer selection, `.gcloudignore`) is a
separate change; this runbook is the cloud infra only.

---

## 0. Config + runtime service account

```bash
gcloud config set project <PROJECT_ID>
gcloud config set run/region asia-south1
source server/deploy/prod/gcp.env

# dedicated Cloud Run runtime SA — IAM is granted to THIS, scoped, in later steps
gcloud iam service-accounts create identity-run \
  --display-name="ru-soam identity Cloud Run runtime"
```

When asked "assign specific IAM roles to a service account?" after enabling APIs
— **answer No.** Roles are granted deliberately + scoped below, never via the
generic post-enable prompt.

## 1. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudkms.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com   # for the deferred purge job (O468)
```

## 2. Cloud SQL (Postgres) + migrations

```bash
export SQL_PASSWORD="$(openssl rand -base64 24)"   # save into gcp.env

# instance — blocks ~5-10 min. If db-f1-micro rejected under Enterprise: --tier=db-g1-small
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro \
  --region="$REGION" --storage-size=10GB --storage-type=SSD \
  --availability-type=zonal --no-deletion-protection

gcloud sql databases create "$SQL_DB" --instance="$SQL_INSTANCE"
gcloud sql users create "$SQL_USER" --instance="$SQL_INSTANCE" --password="$SQL_PASSWORD"

# connection name = PROJECT:REGION:INSTANCE — save into gcp.env as CONN_NAME
gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)'
```

Run goose migrations through the Cloud SQL Auth Proxy (port 5433 to avoid a
local-dev 5432 clash). Needs ADC (`gcloud auth application-default login`).

```bash
# terminal A — proxy (foreground)
curl -o /tmp/cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64
chmod +x /tmp/cloud-sql-proxy
/tmp/cloud-sql-proxy --port 5433 "$CONN_NAME"

# terminal B — migrate
export DATABASE_URL="postgres://${SQL_USER}:${SQL_PASSWORD}@127.0.0.1:5433/${SQL_DB}?sslmode=disable"
cd server/identity && go run ./cmd/migrate up && go run ./cmd/migrate status
```

## 3. KMS keyring + signing key

Regional (asia-south1, matches Run + residency). Asymmetric RSA-2048 PKCS1
SHA256 = RS256. Grant scoped to the **key**, not project-wide.

```bash
gcloud kms keyrings create "$KMS_KEYRING" --location="$REGION"

gcloud kms keys create "$KMS_KEY" \
  --location="$REGION" --keyring="$KMS_KEYRING" \
  --purpose=asymmetric-signing \
  --default-algorithm=rsa-sign-pkcs1-2048-sha256

gcloud kms keys add-iam-policy-binding "$KMS_KEY" \
  --location="$REGION" --keyring="$KMS_KEYRING" \
  --member="serviceAccount:${RUN_SA}" \
  --role="roles/cloudkms.signerVerifier"

# full CryptoKeyVersion name → save into gcp.env as JWT_KMS_KEY_NAME
gcloud kms keys versions describe 1 \
  --location="$REGION" --keyring="$KMS_KEYRING" --key="$KMS_KEY" \
  --format='value(name)'
```

Version 1 is auto-created with the key. The resource name is NOT a secret (no
key material) → passed as a plain Cloud Run env var, not via Secret Manager.

## 4. Secret Manager

Replication pinned to asia-south1 (residency). `printf '%s'` = no trailing
newline (critical for DATABASE_URL). DATABASE_URL uses the unix-socket form for
the Cloud Run connector — `host=/cloudsql/<CONN_NAME>`, NOT 127.0.0.1.

```bash
export DB_URL_PROD="postgres://${SQL_USER}:${SQL_PASSWORD}@/${SQL_DB}?host=/cloudsql/${CONN_NAME}"
printf '%s' "$DB_URL_PROD" | gcloud secrets create identity-database-url \
  --replication-policy=user-managed --locations="$REGION" --data-file=-

# the desktop OAuth client id (the ID-token audience) — same one Main uses
printf '%s' "<CLIENT_ID>.apps.googleusercontent.com" | gcloud secrets create identity-google-client-id \
  --replication-policy=user-managed --locations="$REGION" --data-file=-

for S in identity-database-url identity-google-client-id; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:${RUN_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 5. Artifact Registry + build/push image (Cloud Build)

On a fresh project, Cloud Build runs as the **Compute Engine default SA**, which
has no build perms → grant the builder role bundle once.

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"

gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker --location="$REGION" \
  --description="ru-soam identity images"

export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/identity:latest"  # save into gcp.env

# build context = server/identity/ (Dockerfile + .gcloudignore live there)
gcloud builds submit server/identity --tag "$IMAGE"
```

`.gcloudignore` in `server/identity/` keeps dev `keys/` + `tmp/` out of the GCS
source tarball. The image is multistage-clean regardless (final stage copies
only the binary). After a build, the GCS source tarballs are disposable:
`gcloud storage rm "gs://${PROJECT_ID}_cloudbuild/source/**"`.

## 6. Cloud Run deploy

`--allow-unauthenticated` is correct: the endpoints self-auth (Google ID-token
verify + `requireSession` RS256). Cloud Run IAM is NOT the gate — desktop
clients have no GCP identity. `JWT_KMS_KEY_NAME` set → `build.go` selects the
KMSSigner automatically.

```bash
gcloud run deploy "$RUN_SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --add-cloudsql-instances="$CONN_NAME" \
  --set-env-vars="JWT_KMS_KEY_NAME=${JWT_KMS_KEY_NAME},JWT_ISSUER=ru-soam-identity,LOG_LEVEL=INFO,LOG_FORMAT=json" \
  --set-secrets="DATABASE_URL=identity-database-url:latest,GOOGLE_CLIENT_ID=identity-google-client-id:latest" \
  --allow-unauthenticated \
  --min-instances=0 --max-instances=2 --port=8080
```

Prints a Service URL. Smoke-test:

```bash
BASE="$(gcloud run services describe "$RUN_SERVICE" --region="$REGION" --format='value(status.url)')"
for p in /health /health/live /health/ready; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "$BASE$p"
done   # all 200 — /health/ready pings DB; container boot also proves KMS GetPublicKey
```

Point the desktop client at it: root `.env` `IDENTITY_BASE_URL=<Service URL>`,
restart the app (env baked at launch). Verify the end-to-end chain via prod psql
(proxy from step 2):

```bash
psql "$DATABASE_URL" -c "SELECT event_type, app_version, created_at FROM session_events ORDER BY created_at DESC LIMIT 5;"
```

---

## Deferred (not in this runbook)

- **O468 90d-purge job** — Cloud Run Job + Cloud Scheduler running a `cmd/purge`
  subcommand (`DELETE FROM session_events WHERE created_at < now()-interval '90
  days'`). Last gate before telemetry ships *enabled*. Not built (dev-mode).

## Gotchas hit (first run)

- Post-API-enable "assign IAM roles?" prompt → No (scope deliberately).
- `db-f1-micro` under Enterprise edition may be rejected → fall back to `db-g1-small`.
- Cloud Build 403 on source bucket on a fresh project → grant
  `roles/cloudbuild.builds.builder` to the compute default SA.
- `.gitignore` was moved to `server/`, so `server/identity/` needed its own
  `.gcloudignore` or the build uploads `keys/` + `tmp/` (18.5 MiB vs ~144 KiB).
- DATABASE_URL must be the socket form (`host=/cloudsql/<conn>`) paired with
  `--add-cloudsql-instances`; 127.0.0.1 only works behind the local proxy.
- Runtime SA needs `roles/cloudsql.client` or the connector 403s
  (`cloudsql.instances.get`) and the container fails to boot.
