/**
 * Base-layer product-configuration seam (ADR-106).
 *
 * Holds neutral defaults so the base shell compiles and renders without a
 * domain bootstrap. The domain layer overrides these via bootstrap.ts by
 * calling ProductConfigService.configure() before the app renders.
 *
 * Base files (LoadingSplash, LoginModal, DeleteWorkspaceDialog, …) read
 * product copy from this service — they MUST NOT import src/domain/** directly.
 */

export interface ProductConfig {
  /** Short marketing tagline shown on the splash and sign-in screens. */
  tagline: string;
  /**
   * Optional domain-specific addendum appended to the delete-workspace
   * warning paragraph (e.g. "PHI stored locally will be destroyed.").
   * Empty string = no addendum.
   */
  deleteWarningAddendum: string;
}

const NEUTRAL_DEFAULTS: ProductConfig = {
  tagline: '',
  deleteWarningAddendum: '',
};

export interface IProductConfigService {
  get(): ProductConfig;
  /** Called once by the domain bootstrap before first render (ADR-106). */
  configure(overrides: Partial<ProductConfig>): void;
}

export class ProductConfigService implements IProductConfigService {
  private _config: ProductConfig = { ...NEUTRAL_DEFAULTS };

  /** Called once by the domain bootstrap before first render. */
  configure(overrides: Partial<ProductConfig>): void {
    this._config = { ...NEUTRAL_DEFAULTS, ...overrides };
  }

  get(): ProductConfig {
    return this._config;
  }
}
