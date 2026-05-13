# Local-first pattern

Reference document for the read/write topology adopted in ADR-302. Captures the pattern, why it suits the platform, and the engineering shape it implies. Read this when ADR-302 leaves you wondering "but where do reads come from".

## The pattern in one line

The device's Local Store is the source of truth. Writes go to local first; sync happens in the background; the cloud is the convergence point, not the read path.

## Shape

```
                      ┌─────────────────────────────┐
                      │          Renderer           │
                      │  (reads + optimistic UI)    │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │        Local Store          │  ← single read source
                      │     (canonical on device)   │
                      └────────┬──────────┬─────────┘
                               │          │
                       writes ─┘          └─ change events
                               │
                               ▼
                      ┌─────────────────────────────┐
                      │        Sync Queue           │  ← durable WAL analogue
                      │   (per-class eligibility)   │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │   Sync Worker (background)  │  ← convergence machinery
                      └─────────┬─────────┬─────────┘
                                │         │
                          Cloud │         │  LAN / other transports
                                ▼         ▼
```

The renderer never waits on the cloud to render. The renderer never reads from the cloud directly.

## Rules

1. **Reads always come from the Local Store.** No read path goes to the cloud and waits.
2. **Writes land in the Local Store first.** Always synchronous from the caller's view (atomic local commit). The UI may render optimistically against the write before it lands; once it lands, the render is canonical for the device.
3. **Sync-eligible writes are also durably enqueued.** The sync queue survives restart, OS crash, app crash. Anything in the queue will eventually attempt to sync.
4. **The sync worker is async and out of the request path.** It drains the queue, transmits, receives acks, applies remote changes back to the Local Store, emits change events.
5. **Conflict resolution is the sync worker's job, not the renderer's.** Resolution strategy depends on the data type (CRDT, last-write-wins, user-prompted, etc.) but is invisible to the renderer's read path.
6. **Change events flow from the Local Store outward.** Whether the change originated locally or from a remote sync pull, the renderer sees the same change-event shape.

## Why this fits the platform

- **Offline is the default.** No "offline mode" code path; offline is "the sync worker can't make progress right now" and nothing else cares.
- **One read topology.** The renderer has one place to read from, regardless of whether a record was created locally five seconds ago or pulled from a teammate's edit five minutes ago.
- **Class-level sync eligibility is a clean knob.** Clinical disables the plaintext sync worker; Operational enables it. Same machinery, one flag.
- **Latency is bounded by local IO.** Reads do not pay network cost. Writes do not pay network cost. UX feels fast.
- **PHI never has to wait for cloud.** A workflow that ADR-301 forbids from touching the cloud at all still runs at full speed because reads were never going to the cloud to begin with.

## Engineering shape implied

- The Local Store needs ACID write semantics. SQLite fits.
- The sync queue is a durable table inside the same store. Atomicity of "land write + enqueue sync entry" is straightforward.
- The sync worker is one process, one event loop, one queue drain. Not a thread pool unless transports demand it.
- Conflict resolution needs versioning. Each record carries a version vector or equivalent. The renderer never sees it.
- Change events need a subscription model. The capability layer (ADR-103) exposes change streams typed by data type.

## What this pattern is not

- **Not "cache the cloud locally for speed".** That is a read-through cache, with cloud as the source of truth. Local-first inverts the relationship: local is the source of truth, cloud is the convergence point.
- **Not eventual consistency in the database sense.** Each device's Local Store is strongly consistent with itself. Cross-device convergence is eventually consistent, but that is a sync-worker concern, not a read-path concern.
- **Not "offline-first" as in "works offline as a feature".** Local-first works the same online or offline. There is no online mode and an offline mode; there is one mode, and sync happens or doesn't.

## Prior art

This shape is the operational stance of Linear, Figma, modern note apps (Obsidian, Tana), CRDT-backed collaboration apps (Automerge-based projects), and increasingly the default for desktop-first collaboration software. The mental health workbench inherits the pattern wholesale because the trade-offs (instant reads, offline-by-default, single read topology) are the trade-offs it wants.

## When the pattern strains

- **Server-canonical resources** (a billing record the platform's billing system owns) sit awkwardly. They are read-through cached, not local-first. The platform should treat these as a narrow exception, not the dominant case.
- **Resources too large to keep on every device.** Large attachments may live in cloud-canonical storage with the local store holding a reference, not a copy. Treat as design-level exceptions; do not let them dissolve the rule.

## Related

- ADR-302 — the platform's commitment to this pattern.
- ADR-303 — encrypted-envelope sync over this pattern for Clinical data.
- Open Item O23 — Operational conflict-resolution strategy choice.
