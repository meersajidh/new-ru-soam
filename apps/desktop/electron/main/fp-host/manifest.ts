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
  readonly phi?: boolean;
  readonly kind?: 'command' | 'query';
}

/** Single migration entry declared in a bundle manifest (ADR-506 §4/§8 rung F / O445). */
export interface MigrationManifestEntry {
  readonly version: number;
  readonly description: string;
  readonly sql: string;
}

/** Single query template declared in a bundle manifest (ADR-506 §6 rung F / O445). */
export interface QueryTemplateManifestEntry {
  readonly id: string;
  readonly sql: string;
}

/** Capability dependency declarations (rung F / O445). */
export interface BundleDependencies {
  /** Each entry is "name@version", e.g. "store.write@1.0". */
  readonly capabilities?: ReadonlyArray<string>;
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

/**
 * Single menu item contribution per ADR-417.
 * Author writes `{ "editor/title/context": [{ "command": "...", "group": "1_close@1" }] }`;
 * the validator flattens it, stamping each item with its `menuId` key.
 */
export interface MenuItemManifest {
  readonly menuId: string;
  /** Optional only for label-only submenu parents (has `submenu` + `title`). */
  readonly command?: string;
  readonly group: string;
  readonly order?: number;
  readonly when?: string;
  readonly toggled?: string;
  readonly title?: string;
  /** O424: Alternate command id executed when Alt held. */
  readonly alt?: string;
  /** O425: Menu slot id for submenu flyout. */
  readonly submenu?: string;
  /** O425: Radio group name. */
  readonly radioGroup?: string;
}

/**
 * Single keybinding contribution per ADR-417.
 * Chord syntax is intentionally unenforced here; the runtime keybinding
 * service rejects malformed chords at registration time.
 */
export interface KeybindingManifest {
  readonly key: string;
  readonly command: string;
  readonly when?: string;
  readonly args?: ReadonlyArray<unknown>;
}

export interface BundleContributions {
  readonly 'activityBar.items': ReadonlyArray<ActivityBarItemManifest>;
  readonly viewContainers: ReadonlyArray<ViewContainerManifest>;
  readonly 'panel.views': ReadonlyArray<PanelViewManifest>;
  readonly commands: ReadonlyArray<CommandManifest>;
  readonly menus: ReadonlyArray<MenuItemManifest>;
  readonly keybindings: ReadonlyArray<KeybindingManifest>;
}

export interface BundleManifest {
  readonly id: string;
  readonly version: string;
  readonly entry: string;
  readonly activationEvents: ReadonlyArray<ActivationEvent>;
  readonly capabilities: ReadonlyArray<CapabilityManifestEntry>;
  readonly views: ReadonlyArray<ViewManifestEntry>;
  readonly contributes: BundleContributions;
  /** Tables this bundle exclusively writes (ADR-506 §6 rung C / O446). */
  readonly ownedTables?: ReadonlyArray<string>;
  /** Per-bundle SQL migrations (rung F / O445). */
  readonly migrations?: ReadonlyArray<MigrationManifestEntry>;
  /** Pre-declared SELECT templates consumed by store.query (rung F / O445). */
  readonly queryTemplates?: ReadonlyArray<QueryTemplateManifestEntry>;
  /** Declared capability dependencies (rung F / O445). */
  readonly dependencies?: BundleDependencies;
  /**
   * Physical store residency for this bundle's migrations, ownedTables, and
   * queryTemplates (O452 / ADR-302 §"Residency split").
   * `'operational'` (default): always-open store (prefs, settings, audit).
   * `'protected'`: KEK-gated store, opened on unlock and closed on relock.
   * Base never inspects *what* a domain keeps there — the domain opts in here.
   */
  readonly residency?: 'operational' | 'protected';
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

// Menu-id slot keys allow `/` for paths like "editor/title/context".
const MENU_ID_RE = /^[a-z0-9][a-z0-9_./-]*$/i;

/**
 * Base-platform menu slots that bundles may contribute items INTO (ADR-417 §80).
 * A bundle key matching one of these passes namespace enforcement — it is adding
 * items to a platform slot, not defining a new slot.
 */
const BASE_RESERVED_SLOTS: ReadonlySet<string> = new Set([
  'commandPalette',
  'editor/title',
  'editor/title/context',
  'view/title',
  'view/context',
  'activitybar/item/context',
  'statusbar/item/context',
  'panel/title',
]);

/**
 * First-path-segment surface words owned by the base platform.
 * A menu key whose head segment appears here (but isn't in BASE_RESERVED_SLOTS)
 * is attempting to invent or redefine a base surface slot — rejected.
 * `commandPalette` has no slash so it's caught directly by BASE_RESERVED_SLOTS;
 * it does not need to appear here.
 */
const BASE_SLOT_SURFACES: ReadonlySet<string> = new Set([
  'editor',
  'view',
  'panel',
  'activitybar',
  'statusbar',
]);

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
    if (cap.phi !== undefined && typeof cap.phi !== 'boolean') {
      throw new ManifestError(manifestPath, 'capability `phi` must be a boolean if present');
    }
    if (
      cap.kind !== undefined &&
      cap.kind !== 'command' &&
      cap.kind !== 'query'
    ) {
      throw new ManifestError(manifestPath, 'capability `kind` must be "command" or "query" if present');
    }
    caps.push({
      name: cap.name,
      version: cap.version,
      phi: typeof cap.phi === 'boolean' ? cap.phi : undefined,
      kind: cap.kind === 'command' || cap.kind === 'query' ? cap.kind : undefined,
    });
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
  const menuItems: MenuItemManifest[] = [];
  const keybindingItems: KeybindingManifest[] = [];

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
      const seenCommandIds = new Set<string>();
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
        // O427 / O86: declared command id must be prefixed with this bundle's own id.
        const requiredPrefix = `${m.id as string}.`;
        if (!c.id.startsWith(requiredPrefix)) {
          throw new ManifestError(
            manifestPath,
            `commands id "${c.id}" must start with "${requiredPrefix}" (bundle may only declare commands in its own namespace)`,
          );
        }
        // O427: intra-manifest duplicate command id check.
        if (seenCommandIds.has(c.id)) {
          throw new ManifestError(manifestPath, `commands has duplicate id: "${c.id}"`);
        }
        seenCommandIds.add(c.id);
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

    // Validate menus
    const rawMenus = contrib['menus'];
    if (rawMenus !== undefined) {
      if (!rawMenus || typeof rawMenus !== 'object' || Array.isArray(rawMenus)) {
        throw new ManifestError(manifestPath, '`contributes.menus` must be a non-null object (not an array)');
      }
      const menusObj = rawMenus as Record<string, unknown>;
      for (const menuId of Object.keys(menusObj)) {
        if (!MENU_ID_RE.test(menuId)) {
          throw new ManifestError(
            manifestPath,
            `menus key "${menuId}" must match /^[a-z0-9][a-z0-9_./-]*$/i`,
          );
        }
        // O427: menu slot namespace enforcement (ADR-417 §80).
        if (!BASE_RESERVED_SLOTS.has(menuId)) {
          const head = menuId.split('/')[0];
          if (!menuId.includes('/') || BASE_SLOT_SURFACES.has(head)) {
            throw new ManifestError(
              manifestPath,
              `menus key "${menuId}" is not a declared base slot and a bundle may not define a base-named slot; ` +
                `allowed base slots: ${[...BASE_RESERVED_SLOTS].join(', ')}; ` +
                `domain slots must be namespaced "<bundleId>/..."`,
            );
          }
          // head is a bundle-id-shaped namespace — permitted (own or cross-bundle domain slot).
        }
        const itemsArr = menusObj[menuId];
        if (!Array.isArray(itemsArr)) {
          throw new ManifestError(manifestPath, `menus["${menuId}"] must be an array`);
        }
        for (const item of itemsArr) {
          if (!item || typeof item !== 'object') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item must be an object`);
          }
          const mi = item as Record<string, unknown>;
          // A label-only submenu parent (has `submenu` + `title`) needs no
          // command — selecting it opens the flyout. Every other item must
          // carry a valid command id.
          const isLabelOnlySubmenu = mi.command === undefined && isString(mi.submenu) && isString(mi.title);
          if (!isLabelOnlySubmenu) {
            if (!isString(mi.command)) {
              throw new ManifestError(manifestPath, `menus["${menuId}"] item requires \`command\` as a non-empty string (or omit it on a submenu item with a \`title\`)`);
            }
            if (!CONTRIBUTION_ID_RE.test(mi.command)) {
              throw new ManifestError(
                manifestPath,
                `menus["${menuId}"] command "${mi.command}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
              );
            }
          }
          if (!isString(mi.group)) {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item requires \`group\` as a non-empty string`);
          }
          if (mi.order !== undefined && typeof mi.order !== 'number') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item \`order\` must be a number if present`);
          }
          if (mi.when !== undefined && typeof mi.when !== 'string') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item \`when\` must be a string if present`);
          }
          if (mi.toggled !== undefined && typeof mi.toggled !== 'string') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item \`toggled\` must be a string if present`);
          }
          if (mi.title !== undefined && typeof mi.title !== 'string') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item \`title\` must be a string if present`);
          }
          if (mi.alt !== undefined && typeof mi.alt !== 'string') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item \`alt\` must be a string if present`);
          }
          if (mi.submenu !== undefined && typeof mi.submenu !== 'string') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item \`submenu\` must be a string if present`);
          }
          if (mi.radioGroup !== undefined && typeof mi.radioGroup !== 'string') {
            throw new ManifestError(manifestPath, `menus["${menuId}"] item \`radioGroup\` must be a string if present`);
          }
          menuItems.push({
            menuId,
            command: isString(mi.command) ? mi.command : undefined,
            group: mi.group,
            order: typeof mi.order === 'number' ? mi.order : undefined,
            when: typeof mi.when === 'string' ? mi.when : undefined,
            toggled: typeof mi.toggled === 'string' ? mi.toggled : undefined,
            title: typeof mi.title === 'string' ? mi.title : undefined,
            alt: typeof mi.alt === 'string' ? mi.alt : undefined,
            submenu: typeof mi.submenu === 'string' ? mi.submenu : undefined,
            radioGroup: typeof mi.radioGroup === 'string' ? mi.radioGroup : undefined,
          });
        }
      }
    }

    // Validate keybindings
    const rawKeybindings = contrib['keybindings'];
    if (rawKeybindings !== undefined) {
      if (!Array.isArray(rawKeybindings)) {
        throw new ManifestError(manifestPath, '`contributes.keybindings` must be an array');
      }
      for (const kb of rawKeybindings) {
        if (!kb || typeof kb !== 'object') {
          throw new ManifestError(manifestPath, 'keybindings entry must be an object');
        }
        const k = kb as Record<string, unknown>;
        if (!isString(k.key)) {
          throw new ManifestError(manifestPath, 'keybindings entry requires `key` as a non-empty string');
        }
        if (!isString(k.command)) {
          throw new ManifestError(manifestPath, 'keybindings entry requires `command` as a non-empty string');
        }
        if (!CONTRIBUTION_ID_RE.test(k.command)) {
          throw new ManifestError(
            manifestPath,
            `keybindings command "${k.command}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
          );
        }
        if (k.when !== undefined && typeof k.when !== 'string') {
          throw new ManifestError(manifestPath, 'keybindings when must be a string if present');
        }
        if (k.args !== undefined && !Array.isArray(k.args)) {
          throw new ManifestError(manifestPath, 'keybindings args must be an array if present');
        }
        keybindingItems.push({
          key: k.key,
          command: k.command,
          when: typeof k.when === 'string' ? k.when : undefined,
          args: Array.isArray(k.args) ? (k.args as ReadonlyArray<unknown>) : undefined,
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

  // ── ownedTables (optional) ────────────────────────────────────────────────
  let ownedTables: string[] | undefined;
  if (m.ownedTables !== undefined) {
    if (!Array.isArray(m.ownedTables)) {
      throw new ManifestError(manifestPath, '`ownedTables` must be an array if present');
    }
    ownedTables = [];
    for (const t of m.ownedTables) {
      if (typeof t !== 'string' || t.trim().length === 0) {
        throw new ManifestError(manifestPath, '`ownedTables` entries must be non-empty strings');
      }
      ownedTables.push(t);
    }
  }

  // ── migrations (optional) ─────────────────────────────────────────────────
  let migrations: MigrationManifestEntry[] | undefined;
  if (m.migrations !== undefined) {
    if (!Array.isArray(m.migrations)) {
      throw new ManifestError(manifestPath, '`migrations` must be an array if present');
    }
    migrations = [];
    const seenVersions = new Set<number>();
    for (const entry of m.migrations) {
      if (!entry || typeof entry !== 'object') {
        throw new ManifestError(manifestPath, '`migrations` entries must be objects');
      }
      const me = entry as Record<string, unknown>;
      if (typeof me['version'] !== 'number') {
        throw new ManifestError(manifestPath, '`migrations` entry `version` must be a number');
      }
      if (!isString(me['description'])) {
        throw new ManifestError(manifestPath, '`migrations` entry `description` must be a non-empty string');
      }
      if (!isString(me['sql'])) {
        throw new ManifestError(manifestPath, '`migrations` entry `sql` must be a non-empty string');
      }
      const ver = me['version'] as number;
      if (seenVersions.has(ver)) {
        throw new ManifestError(manifestPath, `\`migrations\` has duplicate version: ${ver}`);
      }
      seenVersions.add(ver);
      migrations.push({ version: ver, description: me['description'] as string, sql: me['sql'] as string });
    }
  }

  // ── queryTemplates (optional) ─────────────────────────────────────────────
  let queryTemplates: QueryTemplateManifestEntry[] | undefined;
  if (m.queryTemplates !== undefined) {
    if (!Array.isArray(m.queryTemplates)) {
      throw new ManifestError(manifestPath, '`queryTemplates` must be an array if present');
    }
    queryTemplates = [];
    for (const entry of m.queryTemplates) {
      if (!entry || typeof entry !== 'object') {
        throw new ManifestError(manifestPath, '`queryTemplates` entries must be objects');
      }
      const qt = entry as Record<string, unknown>;
      if (!isString(qt['id'])) {
        throw new ManifestError(manifestPath, '`queryTemplates` entry `id` must be a non-empty string');
      }
      if (!CONTRIBUTION_ID_RE.test(qt['id'] as string)) {
        throw new ManifestError(
          manifestPath,
          `\`queryTemplates\` entry id "${qt['id']}" must match /^[a-z0-9][a-z0-9_.-]*$/i`,
        );
      }
      if (!isString(qt['sql'])) {
        throw new ManifestError(manifestPath, '`queryTemplates` entry `sql` must be a non-empty string');
      }
      queryTemplates.push({ id: qt['id'] as string, sql: qt['sql'] as string });
    }
  }

  // ── dependencies (optional) ───────────────────────────────────────────────
  let dependencies: BundleDependencies | undefined;
  if (m.dependencies !== undefined) {
    if (!m.dependencies || typeof m.dependencies !== 'object' || Array.isArray(m.dependencies)) {
      throw new ManifestError(manifestPath, '`dependencies` must be an object if present');
    }
    const deps = m.dependencies as Record<string, unknown>;
    let depCaps: string[] | undefined;
    if (deps['capabilities'] !== undefined) {
      if (!Array.isArray(deps['capabilities'])) {
        throw new ManifestError(manifestPath, '`dependencies.capabilities` must be an array if present');
      }
      depCaps = [];
      for (const c of deps['capabilities']) {
        if (typeof c !== 'string' || c.trim().length === 0) {
          throw new ManifestError(
            manifestPath,
            '`dependencies.capabilities` entries must be non-empty "name@version" strings',
          );
        }
        depCaps.push(c);
      }
    }
    dependencies = { capabilities: depCaps };
  }

  // ── residency (optional) ──────────────────────────────────────────────────
  let residency: 'operational' | 'protected' | undefined;
  if (m.residency !== undefined) {
    if (m.residency !== 'operational' && m.residency !== 'protected') {
      throw new ManifestError(
        manifestPath,
        '`residency` must be "operational" or "protected" if present',
      );
    }
    residency = m.residency as 'operational' | 'protected';
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
      menus: menuItems,
      keybindings: keybindingItems,
    },
    ownedTables: ownedTables,
    migrations: migrations,
    queryTemplates: queryTemplates,
    dependencies: dependencies,
    residency: residency,
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
