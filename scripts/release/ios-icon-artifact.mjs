import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './release-utils.mjs';

export const iosIconArtifactDirectory = path.join(repoRoot, 'assets', 'ios-icon');
export const iosPrimaryIconName = 'mac-icon';
// Alternate icons the user picks in Settings > App icon. actool emits no loose PNGs for
// them; they ship only inside Assets.car plus the CFBundleAlternateIcons entry.
export const iosAlternateIconNames = ['halloween-icon'];
export const iosIconNames = [iosPrimaryIconName, ...iosAlternateIconNames];
export const iosIconSourceDirectories = Object.fromEntries(
    iosIconNames.map((name) => [name, path.join(repoRoot, 'assets', `${name}.icon`)])
);
// The launch screen image ships in the same compiled catalog: the release archive excludes
// every catalog source and installs this one Assets.car, so anything left out never ships.
export const iosLaunchCatalogSourceDirectory = path.join(
    repoRoot,
    'apps',
    'ios-swift',
    'Sources',
    'HausApp',
    'Launch.xcassets'
);
export const iosLaunchImageName = 'LaunchGhost';
// The release archive excludes every catalog source and installs the precompiled catalog instead.
export const iosCatalogSourceFileNames = [
    ...iosIconNames.map((name) => `${name}.icon`),
    'Launch.xcassets',
];
export const requiredIOSIconXcodeBuild = '27A5237l';
export const iosIconCompilationOptions = {
    appIcon: iosPrimaryIconName,
    alternateAppIcons: iosAlternateIconNames,
    minimumDeploymentTarget: '18.0',
    platform: 'iphoneos',
    targetDevice: 'iphone',
};
export const iosInstalledIconFiles = [
    'Assets.car',
    `${iosPrimaryIconName}60x60@2x.png`,
    `${iosPrimaryIconName}76x76@2x~ipad.png`,
];
export const iosIconArtifactFiles = [...iosInstalledIconFiles, 'assetcatalog_generated_info.plist'];
export const iosIconArtifactManifestFile = 'manifest.json';

export function assertIOSIconArtifact(directory) {
    for (const file of iosIconArtifactFiles) {
        if (!existsSync(path.join(directory, file))) {
            throw new Error(`compiled iOS icon artifact is missing ${file}`);
        }
    }

    const manifestPath = path.join(directory, iosIconArtifactManifestFile);
    if (!existsSync(manifestPath)) {
        throw new Error(`compiled iOS icon artifact is missing ${iosIconArtifactManifestFile}`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.schemaVersion !== 3) {
        throw new Error('compiled iOS icon artifact has an unsupported manifest schema');
    }
    if (manifest.xcodeBuild !== requiredIOSIconXcodeBuild) {
        throw new Error(
            `compiled iOS icon artifact requires Xcode build ${requiredIOSIconXcodeBuild}`
        );
    }
    if (JSON.stringify(manifest.compilation) !== JSON.stringify(iosIconCompilationOptions)) {
        throw new Error('compiled iOS icon artifact does not match the current actool recipe');
    }
    for (const name of iosIconNames) {
        if (manifest.sourceSha256?.[name] !== hashDirectory(iosIconSourceDirectories[name])) {
            throw new Error(`compiled iOS icon artifact does not match assets/${name}.icon`);
        }
    }
    if (manifest.launchCatalogSha256 !== hashDirectory(iosLaunchCatalogSourceDirectory)) {
        throw new Error('compiled iOS icon artifact does not match Launch.xcassets');
    }
    for (const file of iosIconArtifactFiles) {
        if (manifest.files?.[file] !== hashFile(path.join(directory, file))) {
            throw new Error(`compiled iOS icon artifact checksum failed for ${file}`);
        }
    }
}

export function writeIOSIconArtifactManifest(directory, xcodeBuild) {
    const manifest = {
        schemaVersion: 3,
        xcodeBuild,
        compilation: iosIconCompilationOptions,
        sourceSha256: Object.fromEntries(
            iosIconNames.map((name) => [name, hashDirectory(iosIconSourceDirectories[name])])
        ),
        launchCatalogSha256: hashDirectory(iosLaunchCatalogSourceDirectory),
        files: Object.fromEntries(
            iosIconArtifactFiles.map((file) => [file, hashFile(path.join(directory, file))])
        ),
    };
    writeFileSync(
        path.join(directory, iosIconArtifactManifestFile),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
    );
}

export function inspectIOSIconArtifact(directory) {
    assertIOSIconArtifact(directory);
    for (const name of iosIconNames) {
        assertIOSIconSourceEffects(
            JSON.parse(
                readFileSync(path.join(iosIconSourceDirectories[name], 'icon.json'), 'utf8')
            ),
            name
        );
    }
    const result = spawnSync('xcrun', ['assetutil', '--info', path.join(directory, 'Assets.car')], {
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(
            `assetutil failed to inspect the compiled iOS icon: ${result.stderr.trim()}`
        );
    }
    const renditions = JSON.parse(result.stdout);
    assertIOSIconRenditions(renditions);
    assertIOSLaunchRenditions(renditions);
}

export function assertInstalledIOSIcon({ appDirectory, artifactDirectory }) {
    assertIOSIconArtifact(artifactDirectory);
    for (const file of iosInstalledIconFiles) {
        const installedPath = path.join(appDirectory, file);
        if (!existsSync(installedPath)) {
            throw new Error(`archived iOS app is missing ${file}`);
        }
        if (!readFileSync(installedPath).equals(readFileSync(path.join(artifactDirectory, file)))) {
            throw new Error(`archived iOS app does not contain the prepared ${file}`);
        }
    }

    const plist = spawnSync(
        'plutil',
        ['-convert', 'json', '-o', '-', path.join(appDirectory, 'Info.plist')],
        { encoding: 'utf8' }
    );
    if (plist.status !== 0) {
        throw new Error(`plutil failed to inspect the archived app: ${plist.stderr.trim()}`);
    }
    assertIOSIconBundleMetadata(JSON.parse(plist.stdout));
}

export function assertIOSIconBundleMetadata(info) {
    const icons = info.CFBundleIcons;
    if (icons?.CFBundlePrimaryIcon?.CFBundleIconName !== iosPrimaryIconName) {
        throw new Error(`archived iOS app is missing the ${iosPrimaryIconName} bundle metadata`);
    }
    for (const name of iosAlternateIconNames) {
        if (icons?.CFBundleAlternateIcons?.[name]?.CFBundleIconName !== name) {
            throw new Error(`archived iOS app is missing the ${name} alternate icon metadata`);
        }
    }
}

export function assertIOSIconRenditions(renditions) {
    if (!Array.isArray(renditions)) {
        throw new Error('compiled iOS icon metadata must be an array');
    }
    for (const name of iosIconNames) {
        assertIconRenditions(renditions, name);
    }
}

function assertIconRenditions(renditions, name) {
    const stacks = renditions.filter(
        (rendition) => rendition.AssetType === 'IconImageStack' && rendition.Name === name
    );
    const appearances = new Set(stacks.map((rendition) => rendition.Appearance));
    for (const appearance of ['UIAppearanceLight', 'UIAppearanceDark', 'ISAppearanceTintable']) {
        if (!appearances.has(appearance)) {
            throw new Error(`compiled iOS icon ${name} is missing its ${appearance} icon stack`);
        }
    }

    const layers = stacks.flatMap((rendition) => rendition.Layers ?? []);
    if (!layers.some((layer) => layer.LayerHasSpecular === true)) {
        throw new Error(`compiled iOS icon ${name} lost its specular layers`);
    }

    const marketingIcons = renditions.filter(
        (rendition) =>
            rendition.AssetType === 'Icon Image' &&
            rendition.Name === name &&
            rendition.Idiom === 'phone' &&
            rendition.PixelWidth === 1024 &&
            rendition.PixelHeight === 1024
    );
    const marketingAppearances = new Set(
        marketingIcons.map((rendition) => rendition.Appearance ?? 'UIAppearanceAny')
    );
    for (const appearance of ['UIAppearanceAny', 'UIAppearanceDark', 'ISAppearanceTintable']) {
        if (!marketingAppearances.has(appearance)) {
            throw new Error(
                `compiled iOS icon ${name} is missing its ${appearance} 1024px rendition`
            );
        }
    }
}

export function assertIOSLaunchRenditions(renditions) {
    const launchImages = renditions.filter(
        (rendition) => rendition.AssetType === 'Image' && rendition.Name === iosLaunchImageName
    );
    const appearances = new Set(
        launchImages.map((rendition) => rendition.Appearance ?? 'UIAppearanceAny')
    );
    for (const appearance of ['UIAppearanceAny', 'UIAppearanceDark']) {
        if (!appearances.has(appearance)) {
            throw new Error(`compiled iOS catalog is missing its ${appearance} launch image`);
        }
    }
}

export function assertIOSIconSourceEffects(icon, name = iosPrimaryIconName) {
    if (!(Array.isArray(icon?.features) && icon.features.includes('refractivity'))) {
        throw new Error(`iOS icon source ${name} does not enable refractivity`);
    }
    if (
        !icon.groups?.some(
            (group) =>
                group.refractivity?.enabled === true && Number(group.refractivity.strength) > 0
        )
    ) {
        throw new Error(`iOS icon source ${name} has no active refractive layer`);
    }
}

function hashDirectory(directory) {
    const hash = createHash('sha256');
    for (const file of listFiles(directory)) {
        hash.update(file);
        hash.update('\0');
        hash.update(readFileSync(path.join(directory, file)));
        hash.update('\0');
    }
    return hash.digest('hex');
}

function hashFile(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function listFiles(directory, relativeDirectory = '') {
    const entries = readdirSync(path.join(directory, relativeDirectory), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const relativePath = path.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            files.push(...listFiles(directory, relativePath));
        } else if (entry.isFile()) {
            files.push(relativePath.split(path.sep).join('/'));
        }
    }
    return files.sort();
}
