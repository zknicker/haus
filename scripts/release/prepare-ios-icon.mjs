#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    assertIOSIconArtifact,
    inspectIOSIconArtifact,
    iosIconArtifactDirectory,
    iosIconArtifactFiles,
    iosIconArtifactManifestFile,
    iosIconCompilationOptions,
    iosLaunchCatalogSourceDirectory,
    requiredIOSIconXcodeBuild,
    writeIOSIconArtifactManifest,
} from './ios-icon-artifact.mjs';
import { fail, repoRoot } from './release-utils.mjs';

const force = process.argv.includes('--force');
const outputArgument = process.argv.slice(2).find((argument) => argument !== '--force');
const outputDirectory = path.resolve(outputArgument ?? iosIconArtifactDirectory);

if (!force && artifactMatchesSource(outputDirectory)) {
    console.log(`Full-fidelity iOS icon artifact is current at ${outputDirectory}`);
    process.exit(0);
}

const stagedDirectory = mkdtempSync(path.join(tmpdir(), 'haus-ios-icon-'));
const stagedIcon = path.join(stagedDirectory, 'mac-icon.icon');
const stagedLaunchCatalog = path.join(stagedDirectory, 'Launch.xcassets');
const stagedOutput = path.join(stagedDirectory, 'output');

mkdirSync(stagedOutput, { recursive: true });
cpSync(path.join(repoRoot, 'assets', 'mac-icon.icon'), stagedIcon, { recursive: true });
cpSync(iosLaunchCatalogSourceDirectory, stagedLaunchCatalog, { recursive: true });

const xcodeVersion = run('xcodebuild', ['-version'], { captureOutput: true });
if (!xcodeVersion.includes(`Build version ${requiredIOSIconXcodeBuild}`)) {
    fail(`iOS icon compilation requires Xcode build ${requiredIOSIconXcodeBuild}`, {
        xcodeVersion: xcodeVersion.trim(),
    });
}
console.log(xcodeVersion.trim());
run('xcrun', [
    'actool',
    stagedIcon,
    stagedLaunchCatalog,
    '--app-icon',
    iosIconCompilationOptions.appIcon,
    '--compile',
    stagedOutput,
    '--output-partial-info-plist',
    path.join(stagedOutput, 'assetcatalog_generated_info.plist'),
    '--minimum-deployment-target',
    iosIconCompilationOptions.minimumDeploymentTarget,
    '--platform',
    iosIconCompilationOptions.platform,
    '--target-device',
    iosIconCompilationOptions.targetDevice,
]);
writeIOSIconArtifactManifest(stagedOutput, requiredIOSIconXcodeBuild);
inspectIOSIconArtifact(stagedOutput);
mkdirSync(outputDirectory, { recursive: true });
for (const file of [...iosIconArtifactFiles, iosIconArtifactManifestFile]) {
    cpSync(path.join(stagedOutput, file), path.join(outputDirectory, file));
}
console.log(`Prepared full-fidelity iOS icon artifact at ${outputDirectory}`);

function run(command, args, { captureOutput = false } = {}) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: captureOutput ? 'utf8' : undefined,
        env: process.env,
        stdio: captureOutput ? 'pipe' : 'inherit',
    });
    if (result.status !== 0) {
        fail(`${command} failed while preparing the iOS icon`, {
            status: result.status,
            stderr: result.stderr?.trim(),
        });
    }
    return result.stdout ?? '';
}

function artifactMatchesSource(directory) {
    try {
        assertIOSIconArtifact(directory);
        return true;
    } catch {
        return false;
    }
}
