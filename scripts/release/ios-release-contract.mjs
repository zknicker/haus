import path from 'node:path';

import { isSemver } from './release-utils.mjs';

export function assertIOSReleaseTarget(release, version, buildNumber) {
    const ios = release?.targets?.ios;
    if (!(ios && typeof ios === 'object' && !Array.isArray(ios))) {
        throw new Error('release ledger entry does not publish iOS');
    }
    if (ios.version !== version) {
        throw new Error(`declared iOS target version ${ios.version} does not match ${version}`);
    }
    if (ios.buildNumber !== buildNumber) {
        throw new Error(
            `declared iOS target build ${ios.buildNumber} does not match build ${buildNumber}`
        );
    }
}

export function parseIOSReleaseArgs(argv) {
    if (argv.includes('--help') || argv.includes('-h')) {
        return { help: true };
    }

    const positional = argv.filter((value, index) => {
        const previous = argv[index - 1];
        return !value.startsWith('-') && previous !== '--build-number';
    });
    const version = positional[0];
    const buildNumber = readBuildNumber(argv);

    if (!isSemver(version)) {
        throw new Error('iOS release version must be SemVer');
    }
    if (!buildNumber) {
        throw new Error('--build-number must be a positive integer');
    }

    return {
        buildNumber,
        dryRun: argv.includes('--dry-run'),
        help: false,
        version,
    };
}

export function appStoreConnectAuthenticationArgs(environment = process.env) {
    const keyPath = environment.APPLE_API_KEY_PATH;
    const keyId = environment.APPLE_API_KEY_ID;
    const issuerId = environment.APPLE_API_ISSUER;
    const configured = [keyPath, keyId, issuerId].filter(Boolean).length;

    if (configured === 0) {
        return [];
    }
    if (configured !== 3) {
        throw new Error(
            'APPLE_API_KEY_PATH, APPLE_API_KEY_ID, and APPLE_API_ISSUER must be set together'
        );
    }

    return [
        '-authenticationKeyPath',
        path.resolve(keyPath),
        '-authenticationKeyID',
        keyId,
        '-authenticationKeyIssuerID',
        issuerId,
    ];
}

/**
 * @param profilesByBundleId every signed bundle in the IPA mapped to its
 *   provisioning profile UUID; manual signing fails export for a bundle
 *   without one.
 */
export function appStoreConnectExportOptions(teamId, profilesByBundleId) {
    assertPlistToken('team ID', teamId);
    const entries = Object.entries(profilesByBundleId ?? {}).sort(([left], [right]) =>
        left.localeCompare(right)
    );
    if (entries.length === 0) {
        throw new Error('at least one provisioning profile is required');
    }
    const profiles = entries
        .map(([bundleId, specifier]) => {
            assertPlistToken('bundle ID', bundleId);
            assertPlistToken('provisioning profile specifier', specifier);
            return `        <key>${bundleId}</key>\n        <string>${specifier}</string>`;
        })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>destination</key>
    <string>export</string>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
    <key>method</key>
    <string>app-store-connect</string>
    <key>provisioningProfiles</key>
    <dict>
${profiles}
    </dict>
    <key>signingCertificate</key>
    <string>Apple Distribution</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>teamID</key>
    <string>${teamId}</string>
</dict>
</plist>
`;
}

export function appStoreConnectUploadArgs(ipaPath, environment = process.env) {
    const authentication = appStoreConnectAuthenticationArgs(environment);
    if (authentication.length === 0) {
        throw new Error('App Store Connect authentication is required to upload iOS');
    }
    return [
        'altool',
        '--upload-app',
        '-f',
        path.resolve(ipaPath),
        '-t',
        'ios',
        '--api-key',
        environment.APPLE_API_KEY_ID,
        '--api-issuer',
        environment.APPLE_API_ISSUER,
        '--p8-file-path',
        path.resolve(environment.APPLE_API_KEY_PATH),
        '--output-format',
        'json',
    ];
}

function readBuildNumber(argv) {
    const index = argv.indexOf('--build-number');
    const raw = index === -1 ? null : argv[index + 1];
    if (!(raw && /^\d+$/u.test(raw))) {
        return null;
    }

    const value = Number.parseInt(raw, 10);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function assertPlistToken(name, value) {
    if (!(typeof value === 'string' && /^[A-Za-z0-9.-]+$/u.test(value))) {
        throw new Error(`${name} contains unsupported characters`);
    }
}
