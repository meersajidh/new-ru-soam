import type { RuEditDoc } from '@ru-soam/editor';

/**
 * In-memory doc cache for `ru-edit-scratch://` tabs. Survives tab switches
 * (which remount the editor) but not workbench reload. Phase 7.5a holds
 * scratch docs in memory only; durable persistence lands with the first
 * clinical consumer.
 */
const docs = new Map<string, RuEditDoc>();

export function getScratchDoc(resource: string): RuEditDoc | undefined {
  return docs.get(resource);
}

export function setScratchDoc(resource: string, doc: RuEditDoc): void {
  docs.set(resource, doc);
}

export function dropScratchDoc(resource: string): void {
  docs.delete(resource);
}
