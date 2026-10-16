import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireCompiledIcon, syncOptionalAssetCatalog } from './lib/macos-app-icon.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '..');
const iconsDirectory = path.join(repositoryRoot, 'apps', 'website', 'electron', 'icons');
const generatedIconsDirectory = path.join(
    repositoryRoot,
    'apps',
    'website',
    'electron',
    'generated-icons'
);

// The ghost is the bundle icon. Theme icons (pumpkin) only ship a Dock PNG that the
// running App swaps in with `app.dock.setIcon`.
const macIcons = [
    {
        source: 'mac-icon.icon',
        assetCatalog: 'Assets.car',
        icns: ['AppIcon.icns', 'icon.icns'],
        png: 'AppIcon.png',
    },
    { source: 'halloween-icon.icon', icns: [], png: 'AppIcon-pumpkin.png' },
];

const actoolPath = execFileSync('/usr/bin/xcrun', ['-f', 'actool'], { encoding: 'utf8' }).trim();
mkdirSync(generatedIconsDirectory, { recursive: true });
mkdirSync(iconsDirectory, { recursive: true });

for (const icon of macIcons) {
    const copiedAssetCatalog = compileMacIcon(icon);
    console.log(
        `[haus] macOS app icon compiled from assets/${icon.source} (${copiedAssetCatalog ? 'Assets.car + ' : ''}${icon.png})`
    );
}

function compileMacIcon({ assetCatalog, icns, png, source }) {
    const sourceIconPath = path.join(repositoryRoot, 'assets', source);
    if (!existsSync(sourceIconPath)) {
        throw new Error(`Missing Icon Composer source: ${sourceIconPath}`);
    }

    const stagedIconPath = path.join(
        mkdtempSync(path.join(tmpdir(), 'haus-app-icon-')),
        'AppIcon.icon'
    );
    const outputDirectory = mkdtempSync(path.join(tmpdir(), 'haus-app-icon-out-'));
    const compiledIconPath = path.join(outputDirectory, 'AppIcon.icns');

    try {
        cpSync(sourceIconPath, stagedIconPath, { recursive: true });
        execFileSync(
            actoolPath,
            [
                stagedIconPath,
                '--app-icon',
                'AppIcon',
                '--compile',
                outputDirectory,
                '--output-partial-info-plist',
                path.join(outputDirectory, 'assetcatalog_generated_info.plist'),
                '--minimum-deployment-target',
                '11.0',
                '--platform',
                'macosx',
                '--target-device',
                'mac',
            ],
            { stdio: 'pipe' }
        );

        const copiedAssetCatalog = assetCatalog
            ? syncOptionalAssetCatalog({
                  destinationPath: path.join(generatedIconsDirectory, assetCatalog),
                  sourcePath: path.join(outputDirectory, 'Assets.car'),
              })
            : false;
        requireCompiledIcon(compiledIconPath);
        for (const name of icns) {
            cpSync(compiledIconPath, path.join(iconsDirectory, name));
        }
        execFileSync(
            '/usr/bin/sips',
            ['-s', 'format', 'png', compiledIconPath, '--out', path.join(iconsDirectory, png)],
            { stdio: 'pipe' }
        );
        return copiedAssetCatalog;
    } finally {
        rmSync(path.dirname(stagedIconPath), { recursive: true, force: true });
        rmSync(outputDirectory, { recursive: true, force: true });
    }
}
