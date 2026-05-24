/**
 * Linux guided-install path per ADR-204 §5.
 *
 * electron-updater downloads the .deb to the user's data directory.
 * We expose the path and a copyable `sudo apt install ./<file>` command,
 * then open the .deb in the system's default handler via shell.openPath.
 *
 * A silent background install is deliberately out of scope — installing a .deb
 * requires elevation the running app cannot grant itself in-place without an
 * APT repository (O173).
 */

import path from 'path';
import { shell } from 'electron';
import type { LinuxInstallInfo } from '../../shared/update.js';

/**
 * Build the LinuxInstallInfo for the downloaded .deb at `debPath`.
 * The install command uses the filename only (not the full path) so the user
 * can copy-paste it from any working directory after cd-ing to the folder.
 */
export function buildLinuxInstallInfo(debPath: string): LinuxInstallInfo {
  const fileName = path.basename(debPath);
  return {
    debPath,
    installCommand: `sudo apt install ./${fileName}`,
  };
}

/**
 * Open the .deb in the OS default handler (e.g. GNOME Software, KDE Discover).
 * Returns the error string if openPath fails, null on success.
 */
export async function openDebInSystemHandler(debPath: string): Promise<string | null> {
  const result = await shell.openPath(debPath);
  // shell.openPath returns an empty string on success, error message on failure.
  return result === '' ? null : result;
}
