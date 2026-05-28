/**
 * Audit ledger types — Phase 10b.
 *
 * AuditEventKind is a closed enum of platform-level events. Adding new kinds
 * requires a source-code change here, preventing accidental free-text events.
 */

export type AuditEventKind =
  | 'workspace.unlock'
  | 'workspace.relock'
  | 'workspace.setup.complete'
  | 'workspace.passphrase.changed'
  | 'workspace.recovery.used'
  | 'prefs.set'
  // ADR-308 §7: update-time audit trail
  | 'update.backup.created'
  | 'update.backup.rotated'
  | 'update.migration.started'
  | 'update.migration.succeeded'
  | 'update.migration.failed'
  | 'update.backup.restored'
  | 'update.refused.older-than-min'
  | 'update.refused.newer-than-max'
  // ADR-505 §6: record.patient audit trail (core-domain)
  | 'record.patient.created'
  | 'record.patient.updated'
  | 'record.patient.status.changed'
  | 'record.patient.viewed'
  | 'record.patient.listed';

/**
 * Arbitrary detail attached to an audit entry.
 *
 * MUST NOT contain PHI content — only IDs, enum codes, counts, timestamps.
 * Values are primitives; nested structures are not permitted here.
 */
export type AuditDetail = Record<string, string | number | boolean>;

export interface AuditEntry {
  readonly event: AuditEventKind;
  readonly principal?: string;   // 'system' or workspace nickname
  readonly entityId: string;     // workspaceId
  readonly recordId?: string;    // non-PHI identifier only
  readonly recordType?: string;
  readonly detail?: AuditDetail;
}

export interface AuditRow {
  readonly id: number;
  readonly seq: number;
  readonly ts: number;
  readonly event: string;
  readonly principal: string | null;
  readonly entityId: string;
  readonly recordId: string | null;
  readonly recordType: string | null;
  readonly detail: string | null;  // JSON string
  readonly prevHash: string;
  readonly entryHash: string;
}
