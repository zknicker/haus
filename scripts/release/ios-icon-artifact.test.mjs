import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    assertInstalledIOSIcon,
    assertIOSIconArtifact,
    assertIOSIconRenditions,
    assertIOSIconSourceEffects,
    assertIOSLaunchRenditions,
    iosIconArtifactDirectory,
    requiredIOSIconXcodeBuild,
    writeIOSIconArtifactManifest,
} from './ios-icon-artifact.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('accepts an icon stack when stable Xcode omits preview refraction metadata', () => {
    const stacks = ['UIAppearanceLight', 'UIAppearanceDark', 'ISAppearanceTintable'].map(
        (Appearance) => ({
            Appearance,
            AssetType: 'IconImageStack',
            Layers: [{ LayerHasSpecular: true }],
            Name: 'mac-icon',
        })
    );
    const icons = ['UIAppearanceAny', 'UIAppearanceDark', 'ISAppearanceTintable'].map(
        (Appearance) => ({
            Appearance,
            AssetType: 'Icon Image',
            Idiom: 'phone',
            Name: 'mac-icon',
            PixelHeight: 1024,
            PixelWidth: 1024,
        })
    );
    assert.doesNotThrow(() => assertIOSIconRenditions([...stacks, ...icons]));
});

test('requires active refractivity in the canonical Icon Composer source', () => {
    assert.doesNotThrow(() =>
        assertIOSIconSourceEffects({
            features: ['refractivity'],
            groups: [{ refractivity: { enabled: true, strength: 0.5 } }],
        })
    );
    assert.throws(
        () =>
            assertIOSIconSourceEffects({
                features: ['refractivity'],
                groups: [{ refractivity: { enabled: false, strength: 0.5 } }],
            }),
        /no active refractive layer/
    );
});

test('rejects a flattened icon without the authored glass stack', () => {
    assert.throws(
        () =>
            assertIOSIconRenditions([
                {
                    AssetType: 'Icon Image',
                    Idiom: 'phone',
                    Name: 'mac-icon',
                    PixelHeight: 1024,
                    PixelWidth: 1024,
                },
            ]),
        /missing its UIAppearanceLight icon stack/
    );
});

test('requires the launch image in light and dark', () => {
    const launch = (Appearance) => ({ AssetType: 'Image', Name: 'LaunchGhost', Appearance });
    assert.doesNotThrow(() =>
        assertIOSLaunchRenditions([launch(undefined), launch('UIAppearanceDark')])
    );
    assert.throws(
        () => assertIOSLaunchRenditions([launch(undefined)]),
        /missing its UIAppearanceDark launch image/
    );
});

test('committed icon artifact matches its canonical source and manifest', () => {
    assert.doesNotThrow(() => assertIOSIconArtifact(iosIconArtifactDirectory));
});

test('installs the compiled catalog before signing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'haus-ios-icon-install-'));
    const artifact = path.join(root, 'artifact');
    const product = path.join(root, 'product');
    const app = path.join(product, 'Haus.app');
    mkdirSync(artifact, { recursive: true });
    mkdirSync(app, { recursive: true });
    for (const file of ['Assets.car', 'mac-icon60x60@2x.png', 'mac-icon76x76@2x~ipad.png']) {
        writeFileSync(path.join(artifact, file), file);
    }
    writeFileSync(
        path.join(artifact, 'assetcatalog_generated_info.plist'),
        '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIcons</key><dict><key>CFBundlePrimaryIcon</key><dict><key>CFBundleIconName</key><string>mac-icon</string></dict></dict></dict></plist>'
    );
    writeIOSIconArtifactManifest(artifact, requiredIOSIconXcodeBuild);
    writeFileSync(
        path.join(app, 'Info.plist'),
        '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleName</key><string>Haus</string><key>CFBundleIcons</key><dict><key>CFBundlePrimaryIcon</key><dict><key>CFBundleIconName</key><string>mac-icon</string></dict></dict></dict></plist>'
    );

    const result = spawnSync(
        'bash',
        [path.join(repoRoot, 'apps/ios-swift/scripts/install-precompiled-icon.sh')],
        {
            encoding: 'utf8',
            env: {
                ...process.env,
                HAUS_PRECOMPILED_IOS_ICON_DIR: artifact,
                TARGET_BUILD_DIR: product,
                UNLOCALIZED_RESOURCES_FOLDER_PATH: 'Haus.app',
            },
        }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(path.join(app, 'Assets.car'), 'utf8'), 'Assets.car');
    if (process.platform === 'darwin') {
        assert.doesNotThrow(() =>
            assertInstalledIOSIcon({ appDirectory: app, artifactDirectory: artifact })
        );
    }
});
