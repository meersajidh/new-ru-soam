import { existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const applicationsDir = path.join(os.homedir(), '.local/share/applications');
const oldDesktopFiles = ['ru-soam.desktop', `com.ru${'-soam.desktop'}`];
const iconName = 'ru-soam';
const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512];

console.log('Cleaning up Linux desktop integration...');

for (const file of oldDesktopFiles) {
  const filePath = path.join(applicationsDir, file);
  if (existsSync(filePath)) {
    try {
      console.log(`Uninstalling desktop entry: ${file}`);
      execSync(`xdg-desktop-menu uninstall --mode user "${filePath}"`);
    } catch {
      try {
        rmSync(filePath, { force: true });
      } catch {
        // Ignore cleanup failures.
      }
    }
  }
}

for (const size of iconSizes) {
  const iconPath = path.join(
    os.homedir(),
    `.local/share/icons/hicolor/${size}x${size}/apps/${iconName}.png`,
  );
  try {
    console.log(`Uninstalling icon size: ${size}`);
    execSync(`xdg-icon-resource uninstall --context apps --size ${size} ${iconName}`);
  } catch {
    try {
      rmSync(iconPath, { force: true });
    } catch {
      // Ignore cleanup failures.
    }
  }
}

try {
  console.log('Refreshing icon cache...');
  execSync(`gtk-update-icon-cache -f -t "${path.join(os.homedir(), '.local/share/icons/hicolor')}"`);
} catch {
  // Ignore if the cache tool is unavailable.
}

try {
  console.log('Refreshing desktop database...');
  execSync(`update-desktop-database "${applicationsDir}"`);
} catch {
  // Ignore if unavailable.
}

console.log('Cleanup complete!');
