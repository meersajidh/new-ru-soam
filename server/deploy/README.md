# Cloud Backend — deployment artifacts

Deployment/orchestration artifacts for the server zone (ADR-101 4th trust
zone), kept out of the service code modules.

```
deploy/
├── dev/    # local-dev compose (Postgres, …) — `just db-identity-up`
└── prod/   # Cloud Run / Cloud SQL manifests (lands in 11a.6; no secrets here)
```

- **dev/** — `docker-compose.yml` is a thin aggregator that `include:`s one
  file per concern (`identity-db.yml`, …). Credentials are dev-only and match
  `server/identity/.env.example`.
- **prod/** — declarative deploy manifests minus sensitive values (secrets live
  in Secret Manager, injected at deploy). Added in Phase 11a.6.

Build artifacts (e.g. `Dockerfile`) live with the service they build
(`server/identity/Dockerfile`), not here — `deploy/` is orchestration only.
