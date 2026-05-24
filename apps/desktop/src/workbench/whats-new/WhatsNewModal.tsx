/**
 * WhatsNewModal — shows changelog entries when the app has been upgraded.
 *
 * Auto-show logic:
 *   - lastSeenVersion null → fresh install → persist current silently, NO show.
 *   - current > lastSeenVersion → genuine upgrade → show entries in
 *     range (lastSeenVersion, current].
 *   - current === lastSeenVersion → no-op.
 *
 * On-demand: context key `whatsNew.open` set true by `workbench.showWhatsNew`.
 *   Shows only the current version's entries.
 *
 * Version compare handles prerelease suffixes (0.2.0-beta.1 < 0.2.0).
 *
 * Works offline — changelog.json is bundled by Vite.
 */

import { useState, useEffect } from 'react';
import { useModalKeys } from '../../platform/hooks/useModalKeys';
import { Dialog } from '../../platform/ui/Dialog';
import { useContextKey, useService } from '../../platform/services/hooks';
import { ContextKeyServiceId } from '../../platform/services/ids';
import { usePrefsCapability } from '../../platform/data/use-capability';
import changelog from '../../../changelog.json';
import './WhatsNewModal.css';

// ── Semver comparison ─────────────────────────────────────────────────────────

interface SemVer {
  major: number;
  minor: number;
  patch: number;
  pre: string | null; // e.g. "beta.1" or null
}

function parseSemVer(v: string): SemVer | null {
  // Strip leading 'v' if present
  const s = v.startsWith('v') ? v.slice(1) : v;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(s);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    pre: match[4] ?? null,
  };
}

/**
 * Compare two version strings.
 * Returns: negative if a < b, 0 if equal, positive if a > b.
 * A version with a prerelease tag is lower than the same version without one.
 */
function compareSemVer(a: string, b: string): number {
  const av = parseSemVer(a);
  const bv = parseSemVer(b);
  if (!av || !bv) return 0;

  if (av.major !== bv.major) return av.major - bv.major;
  if (av.minor !== bv.minor) return av.minor - bv.minor;
  if (av.patch !== bv.patch) return av.patch - bv.patch;

  // Same numeric version — compare prerelease:
  // no-pre > pre (1.0.0 > 1.0.0-beta.1)
  if (av.pre === null && bv.pre !== null) return 1;
  if (av.pre !== null && bv.pre === null) return -1;
  // Both have pre or both null → equal
  return 0;
}

// ── Changelog types ───────────────────────────────────────────────────────────

interface ChangeEntry {
  kind: string;
  text: string;
}

interface VersionBlock {
  version: string;
  date: string | null;
  entries: ChangeEntry[];
}

const CHANGELOG = changelog as { versions: VersionBlock[] };

const KIND_ORDER: Record<string, number> = { Added: 0, Changed: 1, Fixed: 2 };
function kindOrder(kind: string): number {
  return KIND_ORDER[kind] ?? 99;
}

// ── Component ─────────────────────────────────────────────────────────────────

const LAST_SEEN_KEY = 'lastSeenVersion';

export function WhatsNewModal() {
  const ctxSvc = useService(ContextKeyServiceId);
  const onDemandOpen = useContextKey('whatsNew.open') === true;
  const prefs = usePrefsCapability();

  // Three-state gate: undefined = loading; null = never persisted; string = last seen version
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // freshInstall: true when lastSeen was null on first load — suppress auto-show
  const [freshInstall, setFreshInstall] = useState(false);

  // Fetch current version once
  useEffect(() => {
    window.soam.app
      .getVersion()
      .then(setCurrentVersion)
      .catch((err: unknown) => {
        console.error('[whats-new] failed to fetch app version:', err);
      });
  }, []);

  // Fetch lastSeenVersion once prefs are bound
  useEffect(() => {
    if (!prefs || currentVersion === null) return;
    prefs
      .get(LAST_SEEN_KEY)
      .then(({ value }) => {
        if (value === null) {
          // Fresh install — persist silently, do NOT show modal
          setFreshInstall(true);
          void prefs.set(LAST_SEEN_KEY, currentVersion);
        }
        setLastSeen(value); // null means never seen; string = last seen version
      })
      .catch((err: unknown) => {
        console.error('[whats-new] failed to read lastSeenVersion:', err);
      });
  }, [prefs, currentVersion]);

  // autoOpen: derived, no state — true when current > lastSeen and not fresh install
  const autoOpen =
    !freshInstall &&
    currentVersion !== null &&
    lastSeen !== undefined &&
    lastSeen !== null &&
    compareSemVer(currentVersion, lastSeen) > 0;

  const isOpen = !dismissed && (autoOpen || onDemandOpen);

  useModalKeys(isOpen ? handleClose : undefined);

  function handleClose() {
    setDismissed(true);
    ctxSvc.set('whatsNew.open', false);
    // Persist lastSeenVersion on dismiss so the modal won't show again
    if (prefs && currentVersion) {
      void prefs.set(LAST_SEEN_KEY, currentVersion);
      setLastSeen(currentVersion);
    }
  }

  if (!isOpen || currentVersion === null) return null;

  // Determine which version blocks to show
  let blocksToShow: VersionBlock[];
  if (onDemandOpen && !autoOpen) {
    // On-demand: show only the current version's entries
    const block = CHANGELOG.versions.find((v) => v.version === currentVersion);
    blocksToShow = block ? [block] : [];
    // If no exact match, show the newest version
    if (blocksToShow.length === 0 && CHANGELOG.versions.length > 0) {
      blocksToShow = [CHANGELOG.versions[0]];
    }
  } else {
    // Auto-show: show entries for versions in range (lastSeen, current]
    const lastSeenVersion = lastSeen ?? null; // narrow away undefined
    blocksToShow = CHANGELOG.versions.filter((v) => {
      const cmp = compareSemVer(v.version, currentVersion);
      // Include: version <= current AND version > lastSeen
      if (cmp > 0) return false; // newer than current — skip
      if (lastSeenVersion !== null && compareSemVer(v.version, lastSeenVersion) <= 0) return false;
      return true;
    });
  }

  return (
    <Dialog
      open={true}
      onClose={handleClose}
      width={520}
      aria-labelledby="whats-new-title"
    >
      <div className="wn-header">
        <div className="wn-header__eyebrow">What's new in Ru-Soam</div>
        <h2 id="whats-new-title" className="t-h2 wn-header__version">
          v{currentVersion}
        </h2>
      </div>

      {blocksToShow.length === 0 ? (
        <p className="t-description wn-empty">No changelog entries for this version.</p>
      ) : (
        <div className="wn-body">
          {blocksToShow.map((block) => (
            <VersionSection key={block.version} block={block} />
          ))}
        </div>
      )}

      <div className="wn-footer">
        <button className="wn-close-btn" onClick={handleClose}>
          Got it
        </button>
      </div>
    </Dialog>
  );
}

function VersionSection({ block }: { block: VersionBlock }) {
  // Group entries by kind
  const grouped = new Map<string, ChangeEntry[]>();
  for (const entry of block.entries) {
    const list = grouped.get(entry.kind) ?? [];
    list.push(entry);
    grouped.set(entry.kind, list);
  }
  const kinds = [...grouped.keys()].sort((a, b) => kindOrder(a) - kindOrder(b));

  return (
    <div className="wn-version-block">
      {kinds.map((kind) => (
        <div key={kind} className="wn-kind-group">
          <div className="wn-kind-label">{kind}</div>
          <ul className="wn-entry-list">
            {grouped.get(kind)!.map((entry, i) => (
              <li key={i} className="wn-entry">
                {entry.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
