#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readJson, repoRoot } from './release-utils.mjs';

const s3Uri = trimTrailingSlash(requireEnv('HAUS_RELEASE_S3_URI'));
const includeDesktop = process.env.HAUS_RELEASE_INCLUDE_DESKTOP !== '0';
const bundleRoot = path.join(repoRoot, 'apps', 'website', 'electron-dist');

const main = async () => {
    const { version } = await readJson('apps/website/package.json');
    const artifactPrefix = `Haus_${version}_arm64`;
    const desktopArtifacts = includeDesktop
        ? [
              ...(await findFiles(bundleRoot, (entry) => entry === 'latest-mac.yml')),
              ...(await findFiles(bundleRoot, (entry) => entry === `${artifactPrefix}.dmg`)),
              ...(await findFiles(bundleRoot, (entry) => entry === `${artifactPrefix}.zip`)),
              ...(await findFiles(
                  bundleRoot,
                  (entry) => entry === `${artifactPrefix}.dmg.blockmap`
              )),
              ...(await findFiles(
                  bundleRoot,
                  (entry) => entry === `${artifactPrefix}.zip.blockmap`
              )),
          ]
        : [];
    if (includeDesktop && desktopArtifacts.length !== 5) {
        console.error(
            `release:publish-desktop error: expected 5 desktop artifacts for ${version}, found ${desktopArtifacts.length}`
        );
        process.exit(1);
    }

    const artifacts = desktopArtifacts;

    for (const artifact of artifacts) {
        const targetUri = `${s3Uri}/${path.basename(artifact)}`;
        runAws(['s3', 'cp', artifact, targetUri]);
        runAws(['s3', 'ls', targetUri]);
    }

    console.log(`Published ${artifacts.length} release artifacts to ${s3Uri}`);
};

await main();

async function findFiles(directory, predicate) {
    const entries = await readdir(directory);
    return entries.filter(predicate).map((entry) => path.join(directory, entry));
}

function runAws(args) {
    const result = spawnSync('aws', args, {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    });

    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        console.error(`release:publish-desktop error: missing ${name}`);
        process.exit(1);
    }

    return value;
}

function trimTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}
