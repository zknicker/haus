import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from './release-utils.mjs';

export const computerAppName = 'Haus Computer.app';
export const releaseComputerBundleId = 'chat.haus.computer';
export const developmentComputerBundleId = 'chat.haus.computer.dev';

const iconPath = path.join(repoRoot, 'apps', 'computer', 'assets', 'AppIcon.icns');

export function computerAppExecutable(appPath) {
    return path.join(appPath, 'Contents', 'MacOS', 'haus-computer');
}

export function computerAppDisplayName(bundleId) {
    return bundleId === releaseComputerBundleId ? 'Haus Computer' : 'Haus Computer Dev';
}

export async function writeComputerAppBundle(appPath, input) {
    await mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
    await mkdir(path.join(appPath, 'Contents', 'Resources'), { recursive: true });
    await writeFile(path.join(appPath, 'Contents', 'Info.plist'), computerInfoPlist(input));
    await copyFile(iconPath, path.join(appPath, 'Contents', 'Resources', 'AppIcon.icns'));
    return computerAppExecutable(appPath);
}

export function computerInfoPlist(input) {
    const name = computerAppDisplayName(input.bundleId);
    const entries = [
        ['CFBundleDevelopmentRegion', 'en'],
        ['CFBundleDisplayName', name],
        ['CFBundleExecutable', 'haus-computer'],
        ['CFBundleIconFile', 'AppIcon'],
        ['CFBundleIdentifier', input.bundleId],
        ['CFBundleInfoDictionaryVersion', '6.0'],
        ['CFBundleName', name],
        ['CFBundlePackageType', 'APPL'],
        ['CFBundleShortVersionString', input.version],
        ['CFBundleVersion', input.version],
        ['LSMinimumSystemVersion', '14.0'],
    ];
    const body = entries
        .map(([key, value]) => `    <key>${key}</key>\n    <string>${escapeXml(value)}</string>`)
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
`;
}

export function archiveComputerApp(appPath, archivePath) {
    execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', appPath, archivePath], {
        stdio: 'inherit',
    });
    return archivePath;
}

export function extractComputerApp(archivePath, root) {
    execFileSync('/usr/bin/ditto', ['-x', '-k', archivePath, root], { stdio: 'inherit' });
    return path.join(root, computerAppName);
}

function escapeXml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
