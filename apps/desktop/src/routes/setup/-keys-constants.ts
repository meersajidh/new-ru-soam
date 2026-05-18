/** Wizard step constants — in a separate file to satisfy react-refresh/only-export-components. */

export const STEPS = ['Sign in', 'Nickname', 'Passphrase', 'Recovery', 'Finish'] as const;

export const STEP_HEADLINES: Record<number, string> = {
  1: 'Sign in to Ru-Soam',
  2: 'Choose a nickname',
  3: 'Set your passphrase',
  4: 'Save your recovery code',
  5: 'Setup complete',
};
