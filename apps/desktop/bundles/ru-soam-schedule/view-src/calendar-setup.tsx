/* eslint-disable react-refresh/only-export-components */
// Entry file — createRoot called at bottom; fast-refresh does not apply here.
import './calendar-setup.css';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewRoot, useSoamView, useViewQuery, useViewChannel, Icon } from '@ru-soam/view-kit';
import type { BoundProxy } from '@ru-soam/view-kit';

// ── Types ───────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  email?: string;
  externalAccountId?: string;
  displayName?: string;
  connectionState: string;
}

interface ProviderCal {
  providerCalendarId: string;
  name?: string;
  /** SQLite integer or boolean depending on cap deserialisation — use !! */
  isPrimary?: boolean | number;
  /** SQLite integer or boolean depending on cap deserialisation — use !! */
  readOnly?: boolean | number;
}

interface AddedCal {
  id: string;
  accountId: string;
  providerCalendarId: string;
  displayName?: string;
  color?: string;
}

interface ScheduleViewStatePayload {
  view?: string;
  calRev?: number;
  classFilter?: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** 10-swatch color palette — copied verbatim from the vanilla source. */
const PALETTE = [
  '#5ac85a',
  '#4ea6e0',
  '#9b78e0',
  '#e07857',
  '#e0b34e',
  '#4eccc4',
  '#e04e8a',
  '#7eaee0',
  '#a0a0a8',
  '#c0965c',
] as const;

// ── Inline SVG helpers (brand logo; no codicon dependency) ───────────────────

function GoogleGIcon() {
  return (
    // eslint-disable-next-line no-restricted-syntax -- brand logo (Google G), not a codicon
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

function CalendarSetup() {
  const soamView = useSoamView();
  const queryParams = useViewQuery();

  const editMode = queryParams['mode'] === 'edit';
  const editCalId = queryParams['id'] ?? null;

  // ── Channel tracking (PRODUCER only) ──────────────────────────────────────
  // calendar-setup is a calRev producer — it bumps on add/update, never
  // invalidates on inbound calRev.  Track view/calRev/classFilter so bumpCalRev
  // can pass them through unchanged.
  //
  // classFilter is echoed VERBATIM from the channel (never set locally).
  // The vanilla's `_classFilter = {}` default was a bug that reset other views'
  // filter on every bump — echoing the last-seen string|null is neutral-or-better.
  const scheduleViewState = useViewChannel<ScheduleViewStatePayload>('scheduleViewState');
  const currentRevRef = useRef(0);
  const currentViewRef = useRef('week');
  const classFilterRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scheduleViewState) return;
    if (typeof scheduleViewState.view === 'string') {
      currentViewRef.current = scheduleViewState.view;
    }
    if (
      typeof scheduleViewState.calRev === 'number' &&
      scheduleViewState.calRev > currentRevRef.current
    ) {
      currentRevRef.current = scheduleViewState.calRev;
    }
    // Echo classFilter verbatim — calendar-setup never changes it.
    classFilterRef.current = scheduleViewState.classFilter ?? null;
  }, [scheduleViewState]);

  // ── Capability proxy refs ──────────────────────────────────────────────────
  // Bound lazily on first use; stable for the view's lifetime.
  const queryProxyRef = useRef<Promise<BoundProxy> | null>(null);
  const cmdProxyRef = useRef<Promise<BoundProxy> | null>(null);

  function getQueryProxy(): Promise<BoundProxy> {
    if (!queryProxyRef.current) {
      queryProxyRef.current = soamView.bindQuery('schedule.calendar.query', '1.0');
    }
    return queryProxyRef.current;
  }

  function getCmdProxy(): Promise<BoundProxy> {
    if (!cmdProxyRef.current) {
      cmdProxyRef.current = soamView.bindCommand('schedule.calendar', '1.0');
    }
    return cmdProxyRef.current;
  }

  // ── bumpCalRev ─────────────────────────────────────────────────────────────
  function bumpCalRev() {
    currentRevRef.current += 1;
    soamView.setScheduleViewState({
      view: currentViewRef.current,
      calRev: currentRevRef.current,
      classFilter: classFilterRef.current,
    });
  }

  // ── Wizard step ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // ── Step 1 state ───────────────────────────────────────────────────────────
  // null = not yet loaded; [] = loaded / zero accounts; [...] = has accounts.
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [s1HeroError, setS1HeroError] = useState('');
  const [s1AcctsError, setS1AcctsError] = useState('');
  // Guard against double-submit across renders (ref, not state).
  const connectingRef = useRef(false);
  const [connecting, setConnecting] = useState(false);

  // ── Step 2 state ───────────────────────────────────────────────────────────
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedAccountEmail, setSelectedAccountEmail] = useState('');
  const [s2Cals, setS2Cals] = useState<ProviderCal[]>([]);
  const [s2Loading, setS2Loading] = useState(false);
  const [s2Error, setS2Error] = useState('');

  // Provider-cal selections carried from step 2 → step 3.
  const [selectedProviderCalId, setSelectedProviderCalId] = useState<string | null>(null);
  const [selectedProviderCalPrimary, setSelectedProviderCalPrimary] = useState(false);
  const [selectedProviderCalReadOnly, setSelectedProviderCalReadOnly] = useState(false);

  // ── Step 3 state ───────────────────────────────────────────────────────────
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [calName, setCalName] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(PALETTE[0]);
  const [s3Error, setS3Error] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Step 4 state ───────────────────────────────────────────────────────────
  const [newCalId, setNewCalId] = useState<string | null>(null);

  // ── loadAccounts ──────────────────────────────────────────────────────────
  async function loadAccounts() {
    setS1HeroError('');
    setS1AcctsError('');
    try {
      const proxy = await getQueryProxy();
      const result = await proxy.call('listAccounts');
      setAccounts(Array.isArray(result) ? (result as Account[]) : []);
    } catch {
      setAccounts([]);
      setS1HeroError('Could not load accounts. Try again.');
    }
  }

  // ── connectGoogle ─────────────────────────────────────────────────────────
  // isHero: true = show error on hero, false = show on accounts list error slot.
  async function connectGoogle(isHero: boolean) {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    if (isHero) {
      setS1HeroError('');
    } else {
      setS1AcctsError('');
    }

    try {
      const proxy = await getCmdProxy();
      const result = (await proxy.call('connectAccount', 'google')) as {
        ok: boolean;
        account?: Account;
        error?: string;
      } | null;

      if (!result?.ok) {
        const msg = result?.error ?? 'Sign-in failed. Try again.';
        if (isHero) {
          setS1HeroError(msg);
        } else {
          setS1AcctsError(msg);
        }
        return;
      }

      const acct = result.account!;
      bumpCalRev();
      // Go directly to step 2 with the newly connected account.
      await startStep2(acct.id, acct.email ?? acct.externalAccountId ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed. Try again.';
      if (isHero) {
        setS1HeroError(msg);
      } else {
        setS1AcctsError(msg);
      }
    } finally {
      connectingRef.current = false;
      setConnecting(false);
    }
  }

  // ── startStep2 ────────────────────────────────────────────────────────────
  // Transitions to step 2 and fetches provider cals for the given account.
  async function startStep2(accountId: string, email: string) {
    setSelectedAccountId(accountId);
    setSelectedAccountEmail(email);
    setS2Loading(true);
    setS2Error('');
    setS2Cals([]);
    setStep(2);

    try {
      const proxy = await getQueryProxy();
      const [providerResult, addedResult] = await Promise.all([
        proxy.call('listProviderCalendars', accountId),
        proxy.call('listAddedCalendars'),
      ]);

      const providerCals = Array.isArray(providerResult) ? (providerResult as ProviderCal[]) : [];
      const addedCals = Array.isArray(addedResult) ? (addedResult as AddedCal[]) : [];

      // Dedupe: exclude cals whose providerCalendarId is already added for THIS account.
      const addedIds = new Set<string>();
      for (const c of addedCals) {
        if (c.accountId === accountId) addedIds.add(c.providerCalendarId);
      }
      setS2Cals(providerCals.filter((c) => !addedIds.has(c.providerCalendarId)));
    } catch {
      setS2Error('Failed to load calendars. Go back and try again.');
    } finally {
      setS2Loading(false);
    }
  }

  // ── pickProviderCal ───────────────────────────────────────────────────────
  // Called when user taps a calendar row in step 2.
  function pickProviderCal(cal: ProviderCal) {
    setSelectedProviderCalId(cal.providerCalendarId);
    setSelectedProviderCalPrimary(!!cal.isPrimary);
    setSelectedProviderCalReadOnly(!!cal.readOnly);
    setCalName(cal.name ?? cal.providerCalendarId);
    setS3Error('');
    setStep(3);
    // Focus + select name input after React flushes the step change.
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
  }

  // ── loadEditMode ──────────────────────────────────────────────────────────
  async function loadEditMode(calId: string) {
    try {
      const proxy = await getQueryProxy();
      const result = await proxy.call('listAddedCalendars');
      const rows = Array.isArray(result) ? (result as AddedCal[]) : [];
      const cal = rows.find((r) => r.id === calId) ?? null;
      if (!cal) {
        setS3Error('Calendar not found.');
        setStep(3);
        return;
      }
      setCalName(cal.displayName ?? '');
      // Prefill color — hold verbatim even if not in the palette (e.g. custom hex).
      if (cal.color) setSelectedColor(cal.color);
      setStep(3);
      requestAnimationFrame(() => {
        nameInputRef.current?.focus();
        nameInputRef.current?.select();
      });
    } catch {
      setS3Error('Could not load calendar. Try again.');
      setStep(3);
    }
  }

  // ── Initial load via onActivate ───────────────────────────────────────────
  // Uses the subscription pattern (setState inside a callback, not directly
  // in the effect body) to satisfy react-hooks/set-state-in-effect.
  // onActivate fires when the view first becomes visible and on re-activation,
  // which is correct:
  //   - add mode: re-fetches accounts list on each activation (always fresh)
  //   - edit mode: re-fetches the calendar row on each activation (stale-safe)
  useEffect(() => {
    const sub = soamView.events.onActivate(() => {
      if (editMode) {
        if (editCalId) void loadEditMode(editCalId);
      } else {
        void loadAccounts();
      }
    });
    return () => sub.dispose();
    // soamView is stable; editMode + editCalId are URL-derived constants (useMemo []).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soamView]);

  // ── doAddCalendar ─────────────────────────────────────────────────────────
  async function doAddCalendar() {
    const name = calName.trim();
    if (!name) {
      nameInputRef.current?.focus();
      setS3Error('Enter a name for the calendar.');
      return;
    }
    if (!selectedProviderCalId) {
      setS3Error('No calendar selected — go back and pick one.');
      return;
    }

    setS3Error('');
    setSaving(true);

    try {
      const proxy = await getCmdProxy();
      const row = (await proxy.call('addCalendar', {
        accountId: selectedAccountId,
        providerCalendarId: selectedProviderCalId,
        name,
        color: selectedColor,
        isPrimary: selectedProviderCalPrimary,
        readOnly: selectedProviderCalReadOnly,
      })) as { id?: string } | null;

      setNewCalId(row?.id ?? null);
      bumpCalRev();
      setStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add calendar. Try again.';
      setS3Error(msg);
      setSaving(false);
    }
    // NOTE: setSaving(false) not called on success — step 4 renders immediately
    // so the "Adding…" label is never visible long enough to matter.
  }

  // ── doSaveEdit ────────────────────────────────────────────────────────────
  async function doSaveEdit() {
    const name = calName.trim();
    if (!name) {
      nameInputRef.current?.focus();
      setS3Error('Enter a name for the calendar.');
      return;
    }
    if (!editCalId) {
      setS3Error('No calendar id — cannot save.');
      return;
    }

    setS3Error('');
    setSaving(true);

    try {
      const proxy = await getCmdProxy();
      await proxy.call('updateCalendar', editCalId, { name, color: selectedColor });
      bumpCalRev();
      soamView.requestClose();
      // View closes — no need to reset saving state.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save. Try again.';
      setS3Error(msg);
      setSaving(false);
    }
  }

  // ── Step navigation helpers ────────────────────────────────────────────────

  function goBackToStep1() {
    setStep(1);
    void loadAccounts();
  }

  function goBackToStep2() {
    if (!selectedAccountId) {
      setStep(1);
      return;
    }
    // Re-fetch provider cals for the same account (deduplication may have changed).
    void startStep2(selectedAccountId, selectedAccountEmail);
  }

  // ── Enter key on name input ────────────────────────────────────────────────
  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (editMode) {
        void doSaveEdit();
      } else {
        void doAddCalendar();
      }
    }
  }

  // ── Step 4 actions ────────────────────────────────────────────────────────

  function handleMigrateNow() {
    if (newCalId) {
      soamView.openInEditor('client-migration', {
        query: 'calendarId=' + encodeURIComponent(newCalId),
        title: 'Migrate clients',
        entityId: 'migration-' + newCalId,
        bundleId: 'ru-soam-practice',
      });
    }
    soamView.requestClose();
  }

  function handleMigrateSkip() {
    soamView.openInEditor('schedule', {
      query: 'id=schedule',
      title: 'Schedule',
      entityId: 'schedule',
    });
    soamView.requestClose();
  }

  // ── Derived display values ────────────────────────────────────────────────
  const hasAccounts = accounts !== null && accounts.length > 0;
  const showHero = !hasAccounts; // true while loading or zero accounts

  const addBtnLabel = saving
    ? editMode
      ? 'Saving…'
      : 'Adding…'
    : editMode
      ? 'Save changes'
      : 'Add calendar';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="wizard-card">
      {/* ── Step 1: Account ──────────────────────────────────────────── */}
      <div className={`step${step === 1 ? ' active' : ''}`}>
        {/* Zero-account hero */}
        <div
          className="connect-hero"
          style={{ display: showHero ? 'flex' : 'none' }}
        >
          <div className="connect-icon-wrap">
            <Icon name="calendar" size={26} />
          </div>
          <div>
            <div className="connect-heading">Connect your Google Calendar</div>
          </div>
          <div className="connect-subtext">
            Schedule reads your existing calendar so you can see, triage, and link client sessions
            — it never becomes your calendar.
          </div>
          <button
            className="btn-google"
            type="button"
            disabled={connecting}
            onClick={() => void connectGoogle(true)}
          >
            {!connecting && <GoogleGIcon />}
            {connecting ? 'Connecting…' : 'Sign in with Google'}
          </button>
          <div className="connect-footer">
            <Icon name="lock" size={11} />
            <span>Your credential never leaves this device. Read-only access by default.</span>
          </div>
          <div className={`inline-error${s1HeroError ? ' visible' : ''}`}>{s1HeroError}</div>
        </div>

        {/* Has-accounts list */}
        <div
          style={{
            display: hasAccounts ? 'flex' : 'none',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div className="step-heading">Choose an account</div>
          <div className="acct-list">
            {(accounts ?? []).map((acct) => {
              const isOk = acct.connectionState === 'connected';
              return (
                <div
                  key={acct.id}
                  className="acct-item"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    void startStep2(acct.id, acct.email ?? acct.externalAccountId ?? '')
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      void startStep2(acct.id, acct.email ?? acct.externalAccountId ?? '');
                    }
                  }}
                >
                  <div
                    className={`acct-dot${isOk ? '' : ' disconnected'}`}
                    title={isOk ? 'Connected' : 'Disconnected'}
                  />
                  <div className="acct-info">
                    {/* Account email is non-client PII — textContent-safe */}
                    <div className="acct-email">
                      {acct.email ?? acct.externalAccountId ?? '—'}
                    </div>
                    {acct.displayName && (
                      <div className="acct-name">{acct.displayName}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            className="btn-connect-another"
            type="button"
            disabled={connecting}
            onClick={() => void connectGoogle(false)}
          >
            <Icon name="add" size={12} />
            {connecting ? 'Connecting…' : 'Connect another Google account'}
          </button>
          <div className={`inline-error${s1AcctsError ? ' visible' : ''}`}>{s1AcctsError}</div>
        </div>
      </div>

      {/* ── Step 2: Choose calendar ───────────────────────────────────── */}
      <div className={`step${step === 2 ? ' active' : ''}`} style={{ gap: 16 }}>
        <div className="step-heading">Pick a calendar</div>
        {/* Muted account email as subtitle */}
        <div className="step-subtext">{selectedAccountEmail}</div>
        <div className="cal-picker">
          {s2Loading && <div className="cal-pick-empty">Loading calendars…</div>}
          {!s2Loading && s2Error && <div className="cal-pick-empty">{s2Error}</div>}
          {!s2Loading && !s2Error && s2Cals.length === 0 && (
            <div className="cal-pick-empty">
              All calendars from this account are already added.
            </div>
          )}
          {!s2Loading &&
            !s2Error &&
            s2Cals.map((cal) => (
              <div
                key={cal.providerCalendarId}
                className="cal-pick-item"
                role="button"
                tabIndex={0}
                onClick={() => pickProviderCal(cal)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') pickProviderCal(cal);
                }}
              >
                {/* Calendar name is non-PHI provider metadata */}
                <div className="cal-pick-name">{cal.name ?? cal.providerCalendarId}</div>
                {!!cal.isPrimary && <span className="cal-badge">Primary</span>}
                {!!cal.readOnly && <span className="cal-badge">Read-only</span>}
              </div>
            ))}
        </div>
        <div className="action-row" style={{ paddingTop: 0 }}>
          <button className="btn-back" type="button" onClick={goBackToStep1}>
            Back
          </button>
        </div>
      </div>

      {/* ── Step 3: Name & color ──────────────────────────────────────── */}
      <div className={`step${step === 3 ? ' active' : ''}`} style={{ gap: 18 }}>
        <div className="step-heading">{editMode ? 'Edit calendar' : 'Name & color'}</div>

        <div className="field-group">
          <label className="field-label" htmlFor="cal-name-input">
            Calendar name
          </label>
          <input
            id="cal-name-input"
            ref={nameInputRef}
            className="text-input"
            type="text"
            placeholder="My calendar"
            autoComplete="off"
            spellCheck={false}
            value={calName}
            onChange={(e) => setCalName(e.target.value)}
            onKeyDown={handleNameKeyDown}
          />
        </div>

        <div className="field-group">
          <div className="field-label">Color</div>
          <div className="color-palette">
            {PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`color-swatch${selectedColor === hex ? ' selected' : ''}`}
                style={{ background: hex }}
                title={hex}
                aria-label={`Color ${hex}`}
                onClick={() => setSelectedColor(hex)}
              />
            ))}
          </div>
        </div>

        <div className={`inline-error${s3Error ? ' visible' : ''}`}>{s3Error}</div>

        <div className="action-row">
          {/* Back hidden in edit mode — nothing to go back to */}
          {!editMode && (
            <button className="btn-back" type="button" onClick={goBackToStep2}>
              Back
            </button>
          )}
          <button
            className="btn-primary"
            type="button"
            disabled={saving}
            onClick={() => {
              if (editMode) {
                void doSaveEdit();
              } else {
                void doAddCalendar();
              }
            }}
          >
            {addBtnLabel}
          </button>
        </div>
      </div>

      {/* ── Step 4: Migrate prompt ────────────────────────────────────── */}
      <div className={`step${step === 4 ? ' active' : ''}`}>
        <div className="migrate-hero">
          <div className="migrate-icon-wrap" aria-hidden="true">
            <Icon name="person-add" size={24} />
          </div>
          <div className="migrate-heading">Migrate existing clients?</div>
          <div className="migrate-subtext">
            Scan this calendar for people who are not in your roster yet and add them as clients.
          </div>
        </div>
        <div className="migrate-actions">
          <button className="btn-migrate-now" type="button" onClick={handleMigrateNow}>
            Migrate clients
          </button>
          <button className="btn-migrate-skip" type="button" onClick={handleMigrateSkip}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById('root');
if (rootEl == null) throw new Error('[calendar-setup] missing #root element');

createRoot(rootEl).render(
  <ViewRoot>
    <CalendarSetup />
  </ViewRoot>,
);
