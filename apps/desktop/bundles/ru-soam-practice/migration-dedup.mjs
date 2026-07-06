/**
 * Migration duplicate-clustering — pure core (ADR-509 §7, A5.3).
 *
 * Extracted from index.mjs (O517 B1) so the union-find + heuristic clustering can
 * be unit-tested in isolation. Pure: no `ctx`, no host caps, no module state, no
 * I/O. `normalizePhone` is injected so the caller owns phone-normalization policy
 * (index.mjs passes its own; tests pass a stub).
 *
 * The fp-host loads bundle code as raw ESM (`import(index.mjs)`), so this is a
 * plain `.mjs` sibling with no build step — keep it dependency-free.
 *
 * @typedef {Object} DedupCandidate
 * @property {string}   participantKey
 * @property {string=}  seedName
 * @property {string=}  seedEmail
 * @property {string=}  seedPhone
 * @property {string[]=} eventRefs
 *
 * @typedef {Object} DedupCluster
 * @property {string} clusterId               Deterministic: `cl_<smallest participantKey>`.
 * @property {'contact'|'heuristic'} reason   `contact` if any confirmed (Google Contacts) edge.
 * @property {Array<{participantKey:string, seedName?:string, seedEmail?:string, seedPhone?:string}>} members
 */

/** Normalize a name for heuristic comparison (trim, lowercase, collapse ws, drop trailing dots). */
function normName(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '');
}

/**
 * Cluster candidates that are likely the same person.
 *
 * Signals, strongest first:
 *   1. Confirmed — same Google Contacts resourceName (`emailGroupMap[email] === rn`).
 *   2. Heuristic — same normalized phone, same normalized name, or a single-token
 *      name that prefix-matches another's full name.
 * Anti-signal: two candidates that co-attend the same event (`eventRefs`) are never
 * merged (they are distinct people in the same meeting).
 *
 * @param {DedupCandidate[]} candidates
 * @param {Record<string,string>} emailGroupMap  lowercased email → Google resourceName.
 * @param {(phone: string) => string} normalizePhone
 * @returns {DedupCluster[]} clusters of ≥2 members (empty if fewer than 2 candidates).
 */
export function clusterDuplicates(candidates, emailGroupMap, normalizePhone) {
  if (!Array.isArray(candidates) || candidates.length < 2) return [];
  const map = emailGroupMap && typeof emailGroupMap === 'object' ? emailGroupMap : {};
  const n = candidates.length;

  // ── Union-find with contact-edge tracking ─────────────────────────────
  const parent = Array.from({ length: n }, (_, i) => i);
  const ufRank = new Array(n).fill(0);
  const hasContactEdge = new Array(n).fill(false);

  function ufFind(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path halving
      x = parent[x];
    }
    return x;
  }

  function ufUnion(i, j, isContact) {
    const ri = ufFind(i);
    const rj = ufFind(j);
    if (ri === rj) {
      if (isContact) hasContactEdge[ri] = true;
      return;
    }
    let newRoot;
    if (ufRank[ri] < ufRank[rj]) {
      parent[ri] = rj;
      newRoot = rj;
    } else if (ufRank[ri] > ufRank[rj]) {
      parent[rj] = ri;
      newRoot = ri;
    } else {
      parent[rj] = ri;
      ufRank[ri]++;
      newRoot = ri;
    }
    // Propagate contact-edge flag to the new root.
    hasContactEdge[newRoot] = isContact || hasContactEdge[ri] || hasContactEdge[rj];
  }

  // ── Anti-signal: build forbidden pairs (shared event ref → different people) ──
  const eventToIdx = new Map(); // eventRef → Set<candidateIndex>
  for (let i = 0; i < n; i++) {
    for (const ref of candidates[i].eventRefs || []) {
      if (!eventToIdx.has(ref)) eventToIdx.set(ref, new Set());
      eventToIdx.get(ref).add(i);
    }
  }
  const forbidden = new Set(); // 'lo,hi' strings
  for (const [, idxSet] of eventToIdx) {
    const idxArr = [...idxSet];
    for (let a = 0; a < idxArr.length; a++) {
      for (let b = a + 1; b < idxArr.length; b++) {
        const lo = Math.min(idxArr[a], idxArr[b]);
        const hi = Math.max(idxArr[a], idxArr[b]);
        forbidden.add(lo + ',' + hi);
      }
    }
  }

  function isForbidden(i, j) {
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    return forbidden.has(lo + ',' + hi);
  }

  // ── Pass 1: Confirmed edges — same Google Contacts resourceName ────────
  for (let i = 0; i < n; i++) {
    const ci = candidates[i];
    if (!ci.seedEmail) continue;
    const rni = map[ci.seedEmail.toLowerCase()];
    if (!rni) continue;
    for (let j = i + 1; j < n; j++) {
      const cj = candidates[j];
      if (!cj.seedEmail) continue;
      if (map[cj.seedEmail.toLowerCase()] !== rni) continue;
      if (isForbidden(i, j)) continue;
      ufUnion(i, j, true);
    }
  }

  // ── Pass 2: Heuristic edges — phone match / name overlap ──────────────
  for (let i = 0; i < n; i++) {
    const ci = candidates[i];
    for (let j = i + 1; j < n; j++) {
      if (ufFind(i) === ufFind(j)) continue; // already unioned
      if (isForbidden(i, j)) continue;
      const cj = candidates[j];
      let shouldUnion = false;

      // Heuristic 1: same normalized phone
      if (!shouldUnion && ci.seedPhone && cj.seedPhone) {
        if (normalizePhone(ci.seedPhone) === normalizePhone(cj.seedPhone)) {
          shouldUnion = true;
        }
      }

      // Heuristic 2: same normalized name
      if (!shouldUnion && ci.seedName && cj.seedName) {
        if (normName(ci.seedName) === normName(cj.seedName)) {
          shouldUnion = true;
        }
      }

      // Heuristic 3: single-token name (no email/phone) matches the other's full name prefix
      if (!shouldUnion) {
        for (const [single, other] of [
          [ci, cj],
          [cj, ci],
        ]) {
          if (!single.seedName) continue;
          if (single.seedEmail || single.seedPhone) continue;
          const singleNorm = normName(single.seedName);
          if (singleNorm.includes(' ')) continue; // not a single token
          if (!other.seedName) continue;
          const otherNorm = normName(other.seedName);
          if (otherNorm === singleNorm || otherNorm.startsWith(singleNorm + ' ')) {
            shouldUnion = true;
            break;
          }
        }
      }

      if (shouldUnion) {
        ufUnion(i, j, false);
      }
    }
  }

  // ── Collect clusters of ≥2 members ─────────────────────────────────────
  const clusterMap = new Map(); // root → indices[]
  for (let i = 0; i < n; i++) {
    const root = ufFind(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root).push(i);
  }

  const clusters = [];
  for (const [root, indices] of clusterMap) {
    if (indices.length < 2) continue;
    const reason = hasContactEdge[root] ? 'contact' : 'heuristic';
    // clusterId = deterministic, keyed on smallest participantKey.
    const minKey = indices.map((i) => candidates[i].participantKey).sort()[0];
    clusters.push({
      clusterId: 'cl_' + minKey,
      reason,
      members: indices.map((i) => ({
        participantKey: candidates[i].participantKey,
        seedName: candidates[i].seedName,
        seedEmail: candidates[i].seedEmail,
        seedPhone: candidates[i].seedPhone,
      })),
    });
  }

  return clusters;
}
