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

/**
 * View contribution per ADR-411. The bundle supplies an HTML entry under
 * `view-assets/`; the `view://` protocol serves it from there. `id` is the
 * stable identifier the platform uses to address this view. `path` is the
 * relative file under `view-assets/`. Both are validated to deny `..`
 * traversal and absolute paths.
 */
export interface ViewManifestEntry {
  readonly id: string;
  readonly path: string;
}

/**
 * Activity-bar item contribution per ADR-405.
 * `viewContainer` must match a declared `viewContainers[].id` in the same manifest.
 * `group` defaults to 'top' when absent.
 */
export interface ActivityBarItemManifest {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly viewContainer: string;
  readonly group: 'top' | 'bottom';
  readonly when?: string;
}

/**
 * View container contribution per ADR-405.
 * `view` must match a declared `views[].id` in the same manifest.
 * `location` defaults to 'primary' when absent (ADR-402).
 * `when` is an optional when-clause that gates display (ADR-407).
 */
export interface ViewContainerManifest {
  readonly id: string;
  readonly title: string;
  readonly view: string;
  readonly location: 'primary' | 'auxiliary';
  readonly when?: string;
}

/**
 * Panel view contribution per ADR-408.
 * `view` must match a declared `views[].id` in the same manifest.
 * `when` gates the tab; `priority` controls ordering (higher = leftmost).
 */
export interface PanelViewManifest {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly view: string;
  readonly when?: string;
  readonly priority: number;
}

/**
 * Command metadata contribution per ADR-406.
 * Surfaces bundle commands in the renderer command palette.
 * Execution is handled separately via the `commands@1.0` capability.
 */
export interface CommandManifest {
  readonly id: string;
  readonly title: string;
  readonly category?: string;
  readonly icon?: string;
  readonly when?: string;
}

export interface BundleContributions {
  readonly 'activityBar.items': ReadonlyArray<ActivityBarItemManifest>;
  readonly viewContainers: ReadonlyArray<ViewContainerManifest>;
  readonly 'panel.views': ReadonlyArray<PanelViewManifest>;
  readonly commands: ReadonlyArray<CommandManifest>;
}

export interface BundleManifest {
  readonly id: string;
  readonly version: string;
  readonly entry: string;
  readonly activationEvents: ReadonlyArray<ActivationEvent>;
  readonly capabilities: ReadonlyArray<CapabilityManifestEntry>;
  readonly views: ReadonlyArray<ViewManifestEntry>;
  readonly contributes: BundleContributions;
}

export interface DiscoveredBundle {
  readonly manifest: BundleManifest;
  readonly bundleDir: string;
  readonly entryPath: string;
  readonly viewAssetsDir: string;
}

const KNOWN_EVENTS: ReadonlySet<ActivationEvent> = new Set(['eager', 'lazy', 'onCommand', 'onEvent']);

// Contribution ids allow dots for namespaced identifiers like "ru-soam-practice.activity".
const CONTRIBUTION_ID_RE = /^[a-z0-9][a-z0-9_.-]*$/i;

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
  if (m.id === '_platform_') {
    throw new ManifestError(manifestPath, '`id` must not be the reserved value "_platform_"');
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(m.id)) {
    throw new ManifestError(manifestPath, '`id` must match /^[a-z0-9][a-z0-9_-]*$/i');
  }
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

  const views: ViewManifestEntry[] = [];
  if (m.views !== undefined) {
    if (!Array.isArray(m.views)) {
      throw new ManifestError(manifestPath, '`views` must be an array if present');
    }
    for (const v of m.views) {
      if (!v || typeof v !== 'object') {
        throw new ManifestError(manifestPath, 'view entry must be an object');
      }
      const view = v as Record<string, unknown>;
      if (!isString(view.id) || !isString(view.path)) {
        throw new ManifestError(manifestPath, 'view requires `id` and `path` strings');
      }
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(view.id)) {
        throw new ManifestError(manifestPath, `view id "${view.id}" must match /^[a-z0-9][a-z0-9_-]*$/i`);
      }
      if (view.path.includes('..') || view.path.startsWith('/') || view.path.startsWith('\\')) {
        throw new ManifestError(manifestPath, `view path "${view.path}" must be relative without ".." segments`);
      }
      views.push({ id: view.id, path: view.path });
    }
  }

  // ── contributes (optional) ──────────────────────────────────────────────────
  const activityBarItems: ActivityBarItemManifest[] = [];
  const viewContainerItems: ViewContainerManifest[] = [];
  const panelViewItems: PanelViewManifest[] = [];
  const commandItems: CommandManifest[] = [];

  if (m.contributes !== undefined) {
    if (!m.contributes || typeof m.contributes !== 'object' || Array.isArray(m.contributes)) {
      throw new ManifestError(manifestPath, '`contributes` must be an object if present');
    }
    const contrib = m.contributes as Record<string, unknown>;

    // Validate activityBar.items
    const rawActivityItems = contrib['activityBar.items'];
    if (rawActivityItems !== undefined) {
      if (!Array.isArray(rawActivityItems)) {
        throw new ManifestError(manifestPath, '`contributes.activityBar.items` must be an array');
      }
      for (const item of rawActivityItems) {
        if (!item || typeof item !== 'object') {
          throw new ManifestError(manifestPath, 'activityBar.items entry must be an object');
        }
        const ai = item as Record<string, unknown>;
        if (!isString(ai.id)) {
          throw new ManifestError(manifestPath, 'activityBar.items entry requires `id` as a non-empty string');
        }
        if (!CONTRIBUTION_ID_RE.test(ai.id)) {
          throw new ManifestError(
            manifestPath,
            `activityBar.items id "${ai.id}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
          );
        }
        if (!isString(ai.label)) {
          throw new ManifestError(manifestPath, 'activityBar.items entry requires `label` as a non-empty string');
        }
        if (!isString(ai.viewContainer)) {
          throw new ManifestError(
            manifestPath,
            'activityBar.items entry requires `viewContainer` as a non-empty string',
          );
        }
        if (!CONTRIBUTION_ID_RE.test(ai.viewContainer)) {
          throw new ManifestError(
            manifestPath,
            `activityBar.items viewContainer "${ai.viewContainer}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
          );
        }
        if (ai.group !== undefined && ai.group !== 'top' && ai.group !== 'bottom') {
          throw new ManifestError(
            manifestPath,
            `activityBar.items group must be "top" or "bottom", got "${String(ai.group)}"`,
          );
        }
        if (ai.icon !== undefined && typeof ai.icon !== 'string') {
          throw new ManifestError(manifestPath, 'activityBar.items icon must be a string if present');
        }
        if (ai.when !== undefined && typeof ai.when !== 'string') {
          throw new ManifestError(manifestPath, 'activityBar.items when must be a string if present');
        }
        activityBarItems.push({
          id: ai.id,
          label: ai.label,
          icon: typeof ai.icon === 'string' ? ai.icon : undefined,
          viewContainer: ai.viewContainer,
          group: ai.group === 'bottom' ? 'bottom' : 'top',
          when: typeof ai.when === 'string' ? ai.when : undefined,
        });
      }
    }

    // Validate viewContainers
    const rawViewContainers = contrib['viewContainers'];
    if (rawViewContainers !== undefined) {
      if (!Array.isArray(rawViewContainers)) {
        throw new ManifestError(manifestPath, '`contributes.viewContainers` must be an array');
      }
      for (const vc of rawViewContainers) {
        if (!vc || typeof vc !== 'object') {
          throw new ManifestError(manifestPath, 'viewContainers entry must be an object');
        }
        const container = vc as Record<string, unknown>;
        if (!isString(container.id)) {
          throw new ManifestError(manifestPath, 'viewContainers entry requires `id` as a non-empty string');
        }
        if (!CONTRIBUTION_ID_RE.test(container.id)) {
          throw new ManifestError(
            manifestPath,
            `viewContainers id "${container.id}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
          );
        }
        if (!isString(container.title)) {
          throw new ManifestError(manifestPath, 'viewContainers entry requires `title` as a non-empty string');
        }
        if (!isString(container.view)) {
          throw new ManifestError(manifestPath, 'viewContainers entry requires `view` as a non-empty string');
        }
        if (
          container.location !== undefined &&
          container.location !== 'primary' &&
          container.location !== 'auxiliary'
        ) {
          throw new ManifestError(
            manifestPath,
            `viewContainers location must be "primary" or "auxiliary", got "${String(container.location)}"`,
          );
        }
        if (container.when !== undefined && typeof container.when !== 'string') {
          throw new ManifestError(manifestPath, 'viewContainers when must be a string if present');
        }
        viewContainerItems.push({
          id: container.id,
          title: container.title,
          view: container.view,
          location: container.location === 'auxiliary' ? 'auxiliary' : 'primary',
          when: typeof container.when === 'string' ? container.when : undefined,
        });
      }
    }

    // Validate panel.views
    const rawPanelViews = contrib['panel.views'];
    if (rawPanelViews !== undefined) {
      if (!Array.isArray(rawPanelViews)) {
        throw new ManifestError(manifestPath, '`contributes.panel.views` must be an array');
      }
      for (const pv of rawPanelViews) {
        if (!pv || typeof pv !== 'object') {
          throw new ManifestError(manifestPath, 'panel.views entry must be an object');
        }
        const panelView = pv as Record<string, unknown>;
        if (!isString(panelView.id)) {
          throw new ManifestError(manifestPath, 'panel.views entry requires `id` as a non-empty string');
        }
        if (!CONTRIBUTION_ID_RE.test(panelView.id)) {
          throw new ManifestError(
            manifestPath,
            `panel.views id "${panelView.id}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
          );
        }
        if (!isString(panelView.title)) {
          throw new ManifestError(manifestPath, 'panel.views entry requires `title` as a non-empty string');
        }
        if (!isString(panelView.view)) {
          throw new ManifestError(manifestPath, 'panel.views entry requires `view` as a non-empty string');
        }
        if (panelView.icon !== undefined && typeof panelView.icon !== 'string') {
          throw new ManifestError(manifestPath, 'panel.views icon must be a string if present');
        }
        if (panelView.when !== undefined && typeof panelView.when !== 'string') {
          throw new ManifestError(manifestPath, 'panel.views when must be a string if present');
        }
        if (panelView.priority !== undefined && typeof panelView.priority !== 'number') {
          throw new ManifestError(manifestPath, 'panel.views priority must be a number if present');
        }
        panelViewItems.push({
          id: panelView.id,
          title: panelView.title,
          icon: typeof panelView.icon === 'string' ? panelView.icon : undefined,
          view: panelView.view,
          when: typeof panelView.when === 'string' ? panelView.when : undefined,
          priority: typeof panelView.priority === 'number' ? panelView.priority : 0,
        });
      }
    }

    // Validate commands
    const rawCommands = contrib['commands'];
    if (rawCommands !== undefined) {
      if (!Array.isArray(rawCommands)) {
        throw new ManifestError(manifestPath, '`contributes.commands` must be an array');
      }
      for (const cmd of rawCommands) {
        if (!cmd || typeof cmd !== 'object') {
          throw new ManifestError(manifestPath, 'commands entry must be an object');
        }
        const c = cmd as Record<string, unknown>;
        if (!isString(c.id)) {
          throw new ManifestError(manifestPath, 'commands entry requires `id` as a non-empty string');
        }
        if (!CONTRIBUTION_ID_RE.test(c.id)) {
          throw new ManifestError(
            manifestPath,
            `commands id "${c.id}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
          );
        }
        if (!isString(c.title)) {
          throw new ManifestError(manifestPath, 'commands entry requires `title` as a non-empty string');
        }
        if (c.category !== undefined && typeof c.category !== 'string') {
          throw new ManifestError(manifestPath, 'commands category must be a string if present');
        }
        if (c.icon !== undefined && typeof c.icon !== 'string') {
          throw new ManifestError(manifestPath, 'commands icon must be a string if present');
        }
        if (c.when !== undefined && typeof c.when !== 'string') {
          throw new ManifestError(manifestPath, 'commands when must be a string if present');
        }
        commandItems.push({
          id: c.id,
          title: c.title,
          category: typeof c.category === 'string' ? c.category : undefined,
          icon: typeof c.icon === 'string' ? c.icon : undefined,
          when: typeof c.when === 'string' ? c.when : undefined,
        });
      }
    }

    // Cross-checks
    const containerIds = new Set(viewContainerItems.map((c) => c.id));
    for (const item of activityBarItems) {
      if (!containerIds.has(item.viewContainer)) {
        throw new ManifestError(
          manifestPath,
          `activityBar.items id "${item.id}" references viewContainer "${item.viewContainer}" which is not declared in contributes.viewContainers`,
        );
      }
    }
    const viewIds = new Set(views.map((v) => v.id));
    for (const container of viewContainerItems) {
      if (!viewIds.has(container.view)) {
        throw new ManifestError(
          manifestPath,
          `viewContainers id "${container.id}" references view "${container.view}" which is not declared in views[]`,
        );
      }
    }
    for (const pv of panelViewItems) {
      if (!viewIds.has(pv.view)) {
        throw new ManifestError(
          manifestPath,
          `panel.views id "${pv.id}" references view "${pv.view}" which is not declared in views[]`,
        );
      }
    }
  }

  return {
    id: m.id,
    version: m.version,
    entry: m.entry,
    activationEvents: events,
    capabilities: caps,
    views,
    contributes: {
      'activityBar.items': activityBarItems,
      viewContainers: viewContainerItems,
      'panel.views': panelViewItems,
      commands: commandItems,
    },
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

    const viewAssetsDir = path.join(bundleDir, 'view-assets');
    out.push({ manifest, bundleDir, entryPath, viewAssetsDir });
  }
  return out;
}
