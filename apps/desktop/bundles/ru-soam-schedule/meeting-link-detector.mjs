/**
 * Meeting-link detector for the ru-soam-schedule bundle.
 *
 * DOMAINS ARE DATA, NOT LOGIC.
 *
 * Two steps for free-text sources:
 *   1. Extract — generic https?:// URL regex, provider-agnostic.
 *   2. Classify — match extracted host against the caller-supplied `providers` list.
 *
 * The caller (index.mjs syncEvents) controls what list is passed in (defaults ∪ user edits).
 * Google-structured links (hangoutLink / conferenceData) are handled upstream, NOT here.
 *
 * PHI note: `description` (event body) is scanned and immediately discarded.
 * Callers must never persist it.
 */

// Generic URL extractor — provider-agnostic.
// Regex terminates on whitespace, HTML delimiters, and common punctuation that
// trail a URL in natural language (parens, brackets, quotes).
// The /g flag is required so the while-exec loop in findFirstClassifiedUrl
// advances through all matches in a field.
var URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Try to classify a URL against the providers list.
 * Returns { url, provider } on match; null if host not in list.
 * @param {string} url
 * @param {Array<{ name: string, domain: string }>} providers
 * @returns {{ url: string, provider: string }|null}
 */
function classifyUrl(url, providers) {
  if (!url) return null;
  var host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (_) {
    return null;
  }
  for (var i = 0; i < providers.length; i++) {
    var p = providers[i];
    if (!p || typeof p.domain !== 'string' || !p.domain) continue;
    var d = p.domain.toLowerCase();
    // Exact match or subdomain match (e.g. 'app.zoom.us' matches 'zoom.us').
    if (host === d || host.endsWith('.' + d)) {
      return { url: url, provider: p.name };
    }
  }
  return null;
}

/**
 * Walk ALL https?:// URLs in `text` in order and return the first one
 * that classifies against `providers`. Returns null if none match.
 *
 * Scanning ALL URLs (not just the first) is essential for event bodies:
 * Modern Health, Calendly, and many providers lead with boilerplate URLs
 * (logo images, unsubscribe links, reschedule links) before the actual
 * meeting URL. Stopping at the first URL silently misses the real link.
 *
 * @param {string|null|undefined} text
 * @param {Array<{ name: string, domain: string }>} providers
 * @returns {{ url: string, provider: string }|null}
 */
function findFirstClassifiedUrl(text, providers) {
  if (!text || typeof text !== 'string') return null;
  URL_RE.lastIndex = 0;
  var m;
  while ((m = URL_RE.exec(text)) !== null) {
    var match = classifyUrl(m[0], providers);
    if (match) return match;
  }
  return null;
}

/**
 * Detect a meeting link from event free-text fields.
 *
 * Precedence: exhaust ALL URLs in `location` before falling through to
 * `description`. This ensures a non-matching boilerplate URL in `location`
 * does not block a valid meeting URL later in the same field, and that the
 * less-trusted `description` body is only consulted when `location` yields
 * no provider match at all.
 *
 * Google-structured link (hangoutLink / conferenceData) takes overall
 * precedence and is handled upstream — this function is only called when
 * those are absent.
 *
 * Returns { url, provider } on the first provider-classified URL found,
 * null if no URL in either field classifies against the providers list.
 *
 * PHI rule: `description` is scanned here and NEVER returned or persisted.
 * Callers (index.mjs syncEvents) must not store it.
 *
 * @param {{ location?: string|null, description?: string|null }} fields
 * @param {Array<{ name: string, domain: string }>} providers
 * @returns {{ url: string, provider: string }|null}
 */
export function detectMeetingLink(fields, providers) {
  if (!providers || providers.length === 0) return null;

  // Exhaust all URLs in location (in order) before trying description.
  var locMatch = findFirstClassifiedUrl(fields && fields.location, providers);
  if (locMatch) return locMatch;

  // Exhaust all URLs in description (event body) — PHI, never stored.
  var descMatch = findFirstClassifiedUrl(fields && fields.description, providers);
  if (descMatch) return descMatch;

  return null;
}

/**
 * Built-in default provider list.
 * Exported so index.mjs can use it as a fallback when the pref is unset.
 * The renderer settings service seeds these into the pref on first load.
 *
 * @type {Array<{ name: string, domain: string }>}
 */
export var DEFAULT_MEETING_PROVIDERS = [
  { name: 'Zoom',    domain: 'zoom.us' },
  { name: 'Teams',   domain: 'teams.microsoft.com' },
  { name: 'Whereby', domain: 'whereby.com' },
  { name: 'doxy.me', domain: 'doxy.me' },
];
