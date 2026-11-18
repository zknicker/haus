#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRequiredTargetsSelected, calculateReleaseImpact } from './release-impact.mjs';
import {
    assertReleaseLedger,
    latestProductVersion,
    releasePublishesTarget,
    releaseTargetNames,
} from './release-ledger.mjs';
import { assertReleaseVersionMetadata } from './release-version-metadata.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const expectedVersion = resolveExpectedVersion(process.argv.slice(2));
const requireComplete =
    expectedVersion !== null || process.argv.slice(2).includes('--require-complete');

const versionedFiles = {
    product: 'packages/haus-api/haus-product.json',
    website: 'apps/website/package.json',
    electronBuilder: 'apps/website/electron-builder.config.cjs',
};

const changelogPath = 'CHANGELOG.md';

const main = async () => {
    const product = await readJson(versionedFiles.product);
    const electronBuilderConfig = require(path.join(repoRoot, versionedFiles.electronBuilder));

    const releaseVersion = assertReleaseVersion(product.version);

    assert(
        electronBuilderConfig.appId === 'chat.haus.desktop',
        'desktop app identifier must be chat.haus.desktop'
    );
    await assertElectronMainRequiresPackaged({
        electronBuilderConfig,
        mainPath: 'apps/website/electron/main.cjs',
    });

    const changelog = await readText(changelogPath);
    assert(
        !/(^|\n)## Unreleased\s*$/m.test(changelog),
        'CHANGELOG.md must not contain ## Unreleased'
    );
    const latestRelease = parseLatestReleaseFromChangelog(changelog);

    assert(
        latestRelease.version === releaseVersion,
        'latest changelog version must match Haus version'
    );

    if (expectedVersion) {
        assert(
            expectedVersion === releaseVersion,
            `expected version ${expectedVersion} does not match ${releaseVersion}`
        );
    }
    try {
        const ledger = await readJson('releases.json');
        const result = assertReleaseLedger(ledger, {
            requireComplete,
        });
        await assertReleaseVersionMetadata(ledger);
        assert(
            latestProductVersion(ledger) === releaseVersion,
            'latest release ledger Haus version must match product metadata'
        );
        if (result.complete && result.latest.version !== null) {
            assert(
                result.latest.version === latestRelease.version,
                'latest release ledger version must match the latest changelog version'
            );
        }
        if (expectedVersion) {
            assert(
                result.latest.version === expectedVersion,
                'latest release ledger entry must match the expected Haus version'
            );
        }
        if (result.complete) {
            const impact = await calculateReleaseImpact({ ledger });
            assertRequiredTargetsSelected({
                impact,
                selectedTargets: Object.fromEntries(
                    releaseTargetNames.map((target) => [
                        target,
                        releasePublishesTarget(result.latest, target),
                    ])
                ),
            });
        }
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }

    console.log('release:check passed');
    console.log(`version: ${releaseVersion}`);
    console.log(`changelog date: ${latestRelease.date}`);
};

await main();

function resolveExpectedVersion(argv) {
    const expectIndex = argv.indexOf('--expect-version');
    if (expectIndex === -1) {
        const ref = process.env.GITHUB_REF ?? '';
        if (!ref.startsWith('refs/tags/v')) {
            return null;
        }

        return ref.replace('refs/tags/v', '');
    }

    const value = argv[expectIndex + 1];
    if (!value) {
        fail('missing value for --expect-version');
    }

    if (!isSemver(value)) {
        fail(`invalid --expect-version value: ${value}`);
    }

    return value;
}

function assertReleaseVersion(version) {
    if (!isSemver(version)) {
        fail(`invalid release version: ${version}`);
    }

    return version;
}

function parseLatestReleaseFromChangelog(changelog) {
    const pattern = /^## v(\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/gm;
    const match = pattern.exec(changelog);
    if (!match) {
        fail('could not find release heading in CHANGELOG.md');
    }

    return {
        version: match[1],
        date: match[2],
        body: changelog.slice(pattern.lastIndex, pattern.exec(changelog)?.index).trim(),
    };
}

async function readJson(relativePath) {
    const content = await readText(relativePath);
    return JSON.parse(content);
}

async function readText(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    return readFile(absolutePath, 'utf8');
}

async function assertElectronMainRequiresPackaged(input) {
    const mainContent = await readText(input.mainPath);
    const packageFiles = input.electronBuilderConfig.files ?? [];
    const packageFileSet = new Set(packageFiles);
    const mainDirectory = path.posix.dirname(input.mainPath.replace(/^apps\/website\//u, ''));
    const localRequirePattern = /require\(['"](\.\/[^'"]+)['"]\)/gu;
    const missingFiles = [];

    for (const match of mainContent.matchAll(localRequirePattern)) {
        const requiredPath = `${path.posix.join(mainDirectory, match[1])}`;

        if (!packageFileSet.has(requiredPath)) {
            missingFiles.push(requiredPath);
        }
    }

    if (missingFiles.length > 0) {
        fail('desktop Electron package is missing files required by main.cjs', {
            missingFiles,
            packageFiles,
        });
    }
}

function isSemver(value) {
    return /^\d+\.\d+\.\d+$/.test(value);
}

function assert(condition, message) {
    if (!condition) {
        fail(message);
    }
}

function fail(message, details) {
    console.error(`release:check error: ${message}`);
    if (details) {
        console.error(JSON.stringify(details, null, 4));
    }

    process.exit(1);
}
