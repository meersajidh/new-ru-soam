/**
 * ESM loader hook: remaps `.js` imports to `.ts` when the `.ts` file exists
 * on disk. This allows `--experimental-strip-types` tests to resolve TypeScript
 * source files that use `.js` extensions per ESM convention.
 *
 * Only applies within this project directory; third-party modules are unaffected.
 */

import { existsSync } from 'node:fs';

const PROJECT_ROOT = new URL('../../', import.meta.url).pathname;

export async function resolve(specifier, context, nextResolve) {
  // Only rewrite relative `.js` → `.ts` for files within this project.
  if (specifier.endsWith('.js') && context.parentURL) {
    const parent = new URL(context.parentURL);
    if (parent.pathname.startsWith(PROJECT_ROOT)) {
      const tsSpecifier = specifier.slice(0, -3) + '.ts';
      const candidate = new URL(tsSpecifier, context.parentURL);
      if (existsSync(candidate)) {
        return nextResolve(tsSpecifier, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
