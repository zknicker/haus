#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const bundleRoot = path.join(repoRoot, 'apps', 'website', 'electron-dist');
const macosBundleDir = path.join(bundleRoot, 'mac-arm64');

const main = async () => {
    const websitePackage = await readJson('apps/website/package.json');
    const version = websitePackage.version;
    const appPath = path.join(macosBundleDir, 'Haus.app');
    const artifactPrefix = `Haus_${version}_arm64`;
    const dmgPath = await findSingleFile(bundleRoot, (entry) => entry === `${artifactPrefix}.dmg`);
    const zipPath = await findSingleFile(bundleRoot, (entry) => entry === `${artifactPrefix}.zip`);
    const latestYamlPath = path.join(bundleRoot, 'latest-mac.yml');
    const sidecarPath = path.join(appPath, 'Contents', 'Resources', 'bin', 'haus-server');
    const packagedIconPath = path.join(appPath, 'Contents', 'Resources', 'icon.icns');
    const buildIconsDir = path.join(repoRoot, 'apps', 'website', 'electron', 'icons');
    const buildIconPath = path.join(buildIconsDir, 'AppIcon.icns');
    const packagedPumpkinPath = path.join(
        appPath,
        'Contents',
        'Resources',
        'app-icons',
        'AppIcon-pumpkin.png'
    );
    const buildPumpkinPath = path.join(buildIconsDir, 'AppIcon-pumpkin.png');

    await assertDirectory(appPath, 'Haus.app');
    await assertDoesNotExist(sidecarPath, 'retired haus-server sidecar');
    await assertMatchingFiles(packagedIconPath, buildIconPath, 'packaged app icon');
    await assertMatchingFiles(packagedPumpkinPath, buildPumpkinPath, 'packaged pumpkin Dock icon');
    await assertFileHasContent(dmgPath, path.basename(dmgPath));
    await assertFileHasContent(zipPath, path.basename(zipPath));

    if (await exists(latestYamlPath)) {
        await assertFileHasContent(latestYamlPath, 'latest-mac.yml');
        const latestYaml = await readFile(latestYamlPath, 'utf8');
        assert(
            latestYaml.includes(`version: ${version}`),
            'latest-mac.yml version must match package version'
        );
        assert(latestYaml.includes('sha512:'), 'latest-mac.yml missing signed artifact checksum');
        assert(latestYaml.includes(path.basename(zipPath)), 'latest-mac.yml missing updater zip');
    }

    console.log('release:check-desktop-artifacts passed');
    console.log(`checked app: ${path.relative(repoRoot, appPath)}`);
    console.log(`checked dmg: ${path.relative(repoRoot, dmgPath)}`);
};

await main();

async function readJson(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    return JSON.parse(await readFile(absolutePath, 'utf8'));
}

async function findSingleFile(directory, predicate) {
    const matches = (await readdir(directory))
        .filter(predicate)
        .map((entry) => path.join(directory, entry));

    if (matches.length !== 1) {
        fail(
            `expected one matching file in ${path.relative(repoRoot, directory)}, found ${matches.length}`
        );
    }

    return matches[0];
}

async function exists(filePath) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

async function assertDirectory(filePath, label) {
    const stats = await stat(filePath);
    if (!stats.isDirectory()) {
        fail(`${label} is missing or not a directory`);
    }
}

async function assertFileHasContent(filePath, label) {
    const stats = await stat(filePath);
    if (!stats.isFile() || stats.size < 1) {
        fail(`${label} is missing or empty`);
    }
}

async function assertDoesNotExist(filePath, label) {
    if (await exists(filePath)) {
        fail(`${label} must not be packaged`);
    }
}

async function assertMatchingFiles(actualPath, expectedPath, label) {
    const [actual, expected] = await Promise.all([readFile(actualPath), readFile(expectedPath)]);
    if (!actual.equals(expected)) {
        fail(`${label} must match the generated release icon`);
    }
}

function assert(condition, message) {
    if (!condition) {
        fail(message);
    }
}

function fail(message) {
    console.error(`release:check-desktop-artifacts error: ${message}`);
    process.exit(1);
}
