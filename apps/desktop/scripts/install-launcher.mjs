import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.resolve(root, 'release');
const applicationsDir = path.join(os.homedir(), '.local/share/applications');
const iconRoot = path.resolve(root, 'electron/assets/icon');
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512];
const iconName = 'ru-soam';
const appImagePath = (() => {
  const candidate = existsSync(releaseDir)
    ? readdirSync(releaseDir).find(
        (name) => name.endsWith('.AppImage') && name.startsWith('Ru-Soam'),
      )
    : null;
  return candidate ? path.resolve(releaseDir, candidate) : null;
})();

if (!appImagePath || !existsSync(appImagePath)) {
  console.error(`AppImage not found at: ${appImagePath}`);
  console.error('Please run "pnpm dist" first.');
  process.exit(1);
}

function sourceIconForSize(size) {
  return path.join(iconRoot, `icon-${size}.png`);
}

function installedIconForSize(size) {
  return path.join(
    os.homedir(),
    `.local/share/icons/hicolor/${size}x${size}/apps/${iconName}.png`,
  );
}

console.log('Installing icons...');
for (const size of iconSizes) {
  const source = sourceIconForSize(size);
  const destination = installedIconForSize(size);
  try {
    execSync(`xdg-icon-resource install --context apps --size ${size} "${source}" ${iconName}`);
  } catch {
    const destDir = path.dirname(destination);
    mkdirSync(destDir, { recursive: true });
    copyFileSync(source, destination);
  }
}

try {
  execSync(`gtk-update-icon-cache -f -t "${path.join(os.homedir(), '.local/share/icons/hicolor')}"`);
} catch {
  // Ignore if the cache tool is unavailable.
}

const tempDesktopPath = path.join(os.tmpdir(), 'ru-soam.desktop');
const desktopEntry = [
  '[Desktop Entry]',
  'Type=Application',
  'Name=Ru-Soam',
  `Exec="${appImagePath}" %U`,
  'Icon=ru-soam',
  'StartupWMClass=ru-soam',
  'Terminal=false',
  'Categories=Office;',
  'StartupNotify=true',
  'Keywords=ru-soam;practitioner;workbench;',
].join('\n');

writeFileSync(tempDesktopPath, `${desktopEntry}\n`);
chmodSync(tempDesktopPath, 0o755);

try {
  console.log('Installing desktop menu entry...');
  execSync(`xdg-desktop-menu install --mode user "${tempDesktopPath}"`);
} catch {
  try {
    mkdirSync(applicationsDir, { recursive: true });
    copyFileSync(tempDesktopPath, path.join(applicationsDir, 'ru-soam.desktop'));
  } catch {
    // Ignore fallback copy errors; the user can inspect the installation.
  }
}

try {
  execSync(`update-desktop-database "${applicationsDir}"`);
} catch {
  // Ignore if the desktop database tool is unavailable.
}

try {
  rmSync(tempDesktopPath, { force: true });
} catch {
  // Ignore temp-file cleanup failures.
}

console.log(`Verified AppImage at: ${appImagePath}`);
