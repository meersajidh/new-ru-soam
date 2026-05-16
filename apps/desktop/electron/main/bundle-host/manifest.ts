import fs from 'fs';
import path from 'path';

/**
 * Bundle manifest reader.
 *
 * Phase 6 scope (per Implementation_Plan): hand-rolled validator covering
 * the minimal shape needed to activate a bundle and route capability calls.
 * Schema hardening (zod, signature, namespace policy) is deferred — see
 * O113 in the plan.
 */

export interface CapabilityManifestEntry {
  readonly name: string;
  readonly version: string;
}

export type ActivationEvent = 'eager' | 'lazy' | 'onCommand' | 'onEvent';

export interface BundleManifest {
  readonly id: string;
  readonly version: string;
  readonly entry: string;
  readonly activationEvents: ReadonlyArray<ActivationEvent>;
  readonly capabilities: ReadonlyArray<CapabilityManifestEntry>;
}

export interface DiscoveredBundle {
  readonly manifest: BundleManifest;
  readonly bundleDir: string;
  readonly entryPath: string;
}

const KNOWN_EVENTS: ReadonlySet<ActivationEvent> = new Set(['eager', 'lazy', 'onCommand', 'onEvent']);

export class ManifestError extends Error {
  constructor(manifestPath: string, message: string) {
    super(`[${manifestPath}] ${message}`);
    this.name = 'ManifestError';
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function validate(raw: unknown, manifestPath: string): BundleManifest {
  if (!raw || typeof raw !== 'object') {
    throw new ManifestError(manifestPath, 'manifest must be a JSON object');
  }
  const m = raw as Record<string, unknown>;
  if (!isString(m.id))      throw new ManifestError(manifestPath, '`id` must be a non-empty string');
  if (!isString(m.version)) throw new ManifestError(manifestPath, '`version` must be a non-empty string');
  if (!isString(m.entry))   throw new ManifestError(manifestPath, '`entry` must be a non-empty string');

  if (!Array.isArray(m.activationEvents)) {
    throw new ManifestError(manifestPath, '`activationEvents` must be an array');
  }
  const events: ActivationEvent[] = [];
  for (const e of m.activationEvents) {
    if (!isString(e) || !KNOWN_EVENTS.has(e as ActivationEvent)) {
      throw new ManifestError(
        manifestPath,
        `unknown activation event: ${String(e)}; allowed: ${[...KNOWN_EVENTS].join(', ')}`,
      );
    }
    events.push(e as ActivationEvent);
  }

  if (!Array.isArray(m.capabilities)) {
    throw new ManifestError(manifestPath, '`capabilities` must be an array');
  }
  const caps: CapabilityManifestEntry[] = [];
  for (const c of m.capabilities) {
    if (!c || typeof c !== 'object') {
      throw new ManifestError(manifestPath, 'capability entry must be an object');
    }
    const cap = c as Record<string, unknown>;
    if (!isString(cap.name) || !isString(cap.version)) {
      throw new ManifestError(manifestPath, 'capability requires `name` and `version` strings');
    }
    caps.push({ name: cap.name, version: cap.version });
  }

  return {
    id: m.id,
    version: m.version,
    entry: m.entry,
    activationEvents: events,
    capabilities: caps,
  };
}

export function discoverBundles(rootDir: string): ReadonlyArray<DiscoveredBundle> {
  if (!fs.existsSync(rootDir)) return [];
  const out: DiscoveredBundle[] = [];
  for (const child of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;
    const bundleDir = path.join(rootDir, child.name);
    const manifestPath = path.join(bundleDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.error(
        `[bundles] failed to parse ${manifestPath}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    let manifest: BundleManifest;
    try {
      manifest = validate(raw, manifestPath);
    } catch (err) {
      console.error(
        `[bundles] invalid manifest ${manifestPath}:`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    const entryPath = path.resolve(bundleDir, manifest.entry);
    if (!fs.existsSync(entryPath)) {
      console.error(`[bundles] entry missing for ${manifest.id}: ${entryPath}`);
      continue;
    }

    out.push({ manifest, bundleDir, entryPath });
  }
  return out;
}
