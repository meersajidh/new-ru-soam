/**
 * Lifecycle stage registry — ADR-505 Amendment 3.
 *
 * Single source of truth for valid lifecycle stage ids at runtime.
 * Lives in Main (core-domain); @ru-soam/domain package exposes only the
 * LifecycleStage type union for compile-time checks — no runtime value there.
 */

export interface LifecycleStageDef {
  readonly id: string;
  readonly label: string;
}

export const LIFECYCLE_STAGES: ReadonlyArray<LifecycleStageDef> = [
  { id: 'referral',   label: 'Referral'  },
  { id: 'intake',     label: 'Intake'    },
  { id: 'active',     label: 'Active'    },
  { id: 'on_hold',    label: 'On Hold'   },
  { id: 'discharged', label: 'Discharged'},
];

export const VALID_STAGES: ReadonlySet<string> = new Set(LIFECYCLE_STAGES.map((s) => s.id));

/** Stages that appear in the Intake board (pre-active pipeline). */
export const PRE_ACTIVE_STAGES: ReadonlyArray<string> = ['referral', 'intake'];
