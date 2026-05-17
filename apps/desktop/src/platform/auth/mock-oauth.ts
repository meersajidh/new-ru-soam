/**
 * Mock OAuth provider — openMockOAuthDialog().
 *
 * Returns { email, googleId } on success, null on cancel.
 * The "googleId" is "mock-" + crypto.randomUUID().
 *
 * Real OAuth replaces this module per O307g (Phase 11/12).
 * The interface { email: string; googleId: string } | null is the stable
 * contract that the real provider must also satisfy.
 */

export interface OAuthResult {
  readonly email: string;
  readonly googleId: string;
}

/**
 * Open a modal dialog prompting for email and return mock OAuth credentials.
 * This function is called by the setup wizard; it should be replaced when
 * real OAuth is implemented (O307g).
 *
 * The actual UI is rendered by the setup route component using the state
 * returned by `createMockOAuthState`. This function itself is a thin wrapper
 * that the route imports directly; the modal renders inline in the wizard.
 *
 * NOTE: Because the setup wizard renders the modal directly (to keep focus
 * trapping in the React tree), this module exports only the result type and
 * the googleId generator. The mock dialog component lives in the setup route.
 */
export function generateMockGoogleId(): string {
  return `mock-${crypto.randomUUID()}`;
}
