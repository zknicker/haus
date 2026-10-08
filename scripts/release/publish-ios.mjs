#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    releaseState,
    waitForIOSBuildStatus,
    writeIOSBuildStatusErrorSummary,
    writeIOSBuildStatusSummary,
} from './ios-build-status.mjs';
import { assertInstalledIOSIcon, inspectIOSIconArtifact } from './ios-icon-artifact.mjs';
import {
    IOS_RELEASE_PROFILES,
    installIOSProvisioningProfile,
} from './ios-provisioning-profile.mjs';
import {
    appStoreConnectAuthenticationArgs,
    appStoreConnectExportOptions,
    appStoreConnectUploadArgs,
    assertIOSReleaseTarget,
    parseIOSReleaseArgs,
} from './ios-release-contract.mjs';
import { assertReleaseLedger } from './release-ledger.mjs';
import { fail, readJson, repoRoot } from './release-utils.mjs';

const iosRoot = path.join(repoRoot, 'apps', 'ios-swift');
const projectPath = path.join(iosRoot, 'Haus.xcodeproj');
const notificationServiceBundle = 'HausNotificationService.appex';
const communicationEntitlement = 'com.apple.developer.usernotifications.communication';
const args = parseArgs();

if (args.help) {
    printUsage();
    process.exit(0);
}

await main(args);

async function main(input) {
    const ledger = await readJson('releases.json');
    const { latest } = assertReleaseLedger(ledger, { requireComplete: true });
    assertIOSReleaseTarget(latest, input.version, input.buildNumber);
    assertCommand('xcodebuild');
    assertCommand('xcodegen');
    verifyGeneratedProject();

    if (input.dryRun) {
        run('xcodebuild', buildArguments(input));
        console.log(`iOS ${input.version} (${input.buildNumber}) dry run passed`);
        return;
    }

    const teamId = process.env.IOS_DEVELOPMENT_TEAM ?? process.env.APPLE_TEAM_ID;
    if (!teamId) {
        fail('IOS_DEVELOPMENT_TEAM or APPLE_TEAM_ID is required for an iOS release');
    }

    const authentication = appStoreConnectAuthenticationArgs();
    const iconArtifactDirectory = process.env.HAUS_PRECOMPILED_IOS_ICON_DIR;
    if (!iconArtifactDirectory) {
        fail('HAUS_PRECOMPILED_IOS_ICON_DIR is required for an iOS release');
    }
    inspectIOSIconArtifact(iconArtifactDirectory);
    const provisioningProfiles = [];
    for (const profile of IOS_RELEASE_PROFILES) {
        provisioningProfiles.push(await installIOSProvisioningProfile(profile));
    }
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'haus-ios-release-'));
    const archivePath = path.join(outputRoot, 'Haus.xcarchive');
    const exportPath = path.join(outputRoot, 'export');
    const exportOptionsPath = path.join(outputRoot, 'ExportOptions.plist');
    for (const profile of provisioningProfiles) {
        assertProvisioningProfileReadable(profile.path);
    }
    writeFileSync(
        exportOptionsPath,
        appStoreConnectExportOptions(
            teamId,
            Object.fromEntries(provisioningProfiles.map(({ bundleId, uuid }) => [bundleId, uuid]))
        ),
        'utf8'
    );

    run('xcodebuild', [
        '-project',
        projectPath,
        '-scheme',
        'Haus',
        '-configuration',
        'Release',
        '-destination',
        'generic/platform=iOS',
        '-archivePath',
        archivePath,
        '-allowProvisioningUpdates',
        ...authentication,
        'archive',
        `DEVELOPMENT_TEAM=${teamId}`,
        `MARKETING_VERSION=${input.version}`,
        `CURRENT_PROJECT_VERSION=${input.buildNumber}`,
        'ENABLE_USER_SCRIPT_SANDBOXING=NO',
        // Both catalog sources ship precompiled in HAUS_PRECOMPILED_IOS_ICON_DIR.
        'EXCLUDED_SOURCE_FILE_NAMES=mac-icon.icon Launch.xcassets',
        `HAUS_PRECOMPILED_IOS_ICON_DIR=${iconArtifactDirectory}`,
    ]);
    assertInstalledIOSIcon({
        appDirectory: path.join(archivePath, 'Products', 'Applications', 'Haus.app'),
        artifactDirectory: iconArtifactDirectory,
    });
    run('xcodebuild', [
        '-exportArchive',
        '-archivePath',
        archivePath,
        '-exportPath',
        exportPath,
        '-exportOptionsPlist',
        exportOptionsPath,
    ]);
    const ipaPath = findExportedIPA(exportPath);
    const exportedApp = extractExportedApp({ ipaPath, outputRoot });
    assertInstalledIOSIcon({ appDirectory: exportedApp, artifactDirectory: iconArtifactDirectory });
    assertExportedCommunicationNotifications(exportedApp);
    run('xcrun', appStoreConnectUploadArgs(ipaPath));

    console.log(`Uploaded iOS ${input.version} (${input.buildNumber}) to App Store Connect`);
    try {
        const build = await waitForIOSBuildStatus({
            buildNumber: input.buildNumber,
            timeoutMs: 300_000,
            version: input.version,
        });
        const state = releaseState(build.processingState);
        writeIOSBuildStatusSummary(build);
        console.log(
            `App Store Connect reports iOS ${input.version} (${input.buildNumber}) ${state}`
        );
        if (state === 'failed') {
            fail(`Apple processing ended ${build.processingState}`);
        }
    } catch (error) {
        writeIOSBuildStatusErrorSummary();
        console.warn(
            `App Store processing evidence unavailable: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

function assertProvisioningProfileReadable(profilePath) {
    const result = spawnSync('security', ['cms', '-D', '-i', profilePath], {
        cwd: repoRoot,
        stdio: 'ignore',
    });
    if (result.status !== 0) {
        fail('downloaded iOS provisioning profile is not a readable CMS document');
    }
}

function findExportedIPA(exportPath) {
    const ipaFiles = readdirSync(exportPath).filter((file) => file.endsWith('.ipa'));
    if (ipaFiles.length !== 1) {
        fail(`expected exactly one exported IPA, found ${ipaFiles.length}`);
    }
    return path.join(exportPath, ipaFiles[0]);
}

function extractExportedApp({ ipaPath, outputRoot }) {
    const extractionRoot = mkdtempSync(path.join(outputRoot, 'ipa-'));
    run('unzip', ['-q', ipaPath, '-d', extractionRoot]);
    const payloadDirectory = path.join(extractionRoot, 'Payload');
    const apps = readdirSync(payloadDirectory).filter((file) => file.endsWith('.app'));
    if (apps.length !== 1) {
        fail(`expected exactly one app in the exported IPA, found ${apps.length}`);
    }
    return path.join(payloadDirectory, apps[0]);
}

/**
 * Avatar banners need both the embedded Notification Service extension and
 * the app's communication entitlement; a profile missing the capability
 * silently strips it at export.
 */
function assertExportedCommunicationNotifications(appDirectory) {
    if (!existsSync(path.join(appDirectory, 'PlugIns', notificationServiceBundle))) {
        fail(`exported IPA is missing PlugIns/${notificationServiceBundle}`);
    }
    const result = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', appDirectory], {
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        fail('could not read the exported app entitlements');
    }
    const pattern = new RegExp(
        `<key>${communicationEntitlement.replaceAll('.', '\\.')}</key>\\s*<true/>`,
        'u'
    );
    if (!pattern.test(result.stdout)) {
        fail(`exported app is not signed with ${communicationEntitlement}`);
    }
}

function parseArgs() {
    try {
        return parseIOSReleaseArgs(process.argv.slice(2));
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
}

function printUsage() {
    console.log(
        [
            'Usage: bun run ios:release <version> --build-number <number> [--dry-run]',
            '',
            'Dry run: verifies the generated project and performs an unsigned Release build.',
            'Release: archives and uploads the declared build to App Store Connect/TestFlight.',
        ].join('\n')
    );
}

function buildArguments(input) {
    return [
        '-project',
        projectPath,
        '-scheme',
        'Haus',
        '-configuration',
        'Release',
        '-destination',
        'generic/platform=iOS Simulator',
        '-derivedDataPath',
        path.join(tmpdir(), 'haus-ios-dry-run'),
        'build',
        'CODE_SIGNING_ALLOWED=NO',
        `MARKETING_VERSION=${input.version}`,
        `CURRENT_PROJECT_VERSION=${input.buildNumber}`,
    ];
}

function verifyGeneratedProject() {
    const generatedPaths = [
        'apps/ios-swift/Config/Haus.entitlements',
        'apps/ios-swift/Config/Info.plist',
        'apps/ios-swift/Config/NotificationService-Info.plist',
        'apps/ios-swift/Haus.xcodeproj',
    ];
    assertGeneratedPathsClean(generatedPaths);
    run('xcodegen', ['generate', '--spec', 'project.yml', '--quiet'], { cwd: iosRoot });
    if (
        spawnSync('git', ['diff', '--quiet', '--', ...generatedPaths], { cwd: repoRoot }).status !==
        0
    ) {
        fail(
            'checked-in Xcode project is stale; run xcodegen generate --spec apps/ios-swift/project.yml'
        );
    }
}

function assertGeneratedPathsClean(paths) {
    if (spawnSync('git', ['diff', '--quiet', '--', ...paths], { cwd: repoRoot }).status !== 0) {
        fail('iOS generated files have uncommitted changes; commit or restore them before release');
    }
}

function assertCommand(command) {
    const result = spawnSync('which', [command], { stdio: 'ignore' });
    if (result.status !== 0) {
        fail(`${command} is required for an iOS release`);
    }
}

function run(command, commandArgs, options = {}) {
    const result = spawnSync(command, commandArgs, {
        cwd: options.cwd ?? repoRoot,
        env: process.env,
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        fail(`${command} failed`, { status: result.status });
    }
}
