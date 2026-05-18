import { AuditService } from './audit-service.js';

export const auditService = new AuditService();

export type { AuditEntry, AuditEventKind, AuditDetail } from './audit-types.js';
