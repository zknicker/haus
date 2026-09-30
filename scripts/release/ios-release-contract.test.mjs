import { expect, test } from 'bun:test';

import {
    appStoreConnectAuthenticationArgs,
    appStoreConnectExportOptions,
    appStoreConnectUploadArgs,
    assertIOSReleaseTarget,
    parseIOSReleaseArgs,
} from './ios-release-contract.mjs';

test('parses an iOS version and monotonically increasing build number', () => {
    expect(parseIOSReleaseArgs(['1.0.0', '--build-number', '7', '--dry-run'])).toEqual({
        buildNumber: 7,
        dryRun: true,
        help: false,
        version: '1.0.0',
    });
    expect(() => parseIOSReleaseArgs(['1.0', '--build-number', '7'])).toThrow(
        'version must be SemVer'
    );
    expect(() => parseIOSReleaseArgs(['1.0.0', '--build-number', '0'])).toThrow('positive integer');
});

test('preserves the coordinated version and build during App Store export', () => {
    const options = appStoreConnectExportOptions('TEAM123', {
        'chat.haus.ios': 'PROFILE-UUID',
        'chat.haus.ios.NotificationService': 'EXTENSION-UUID',
    });
    expect(options).toContain('<key>manageAppVersionAndBuildNumber</key>\n    <false/>');
    expect(options).toContain('<key>teamID</key>\n    <string>TEAM123</string>');
    expect(options).toContain('<key>signingStyle</key>\n    <string>manual</string>');
    expect(options).toContain(
        '<key>signingCertificate</key>\n    <string>Apple Distribution</string>'
    );
    expect(options).toContain('<key>chat.haus.ios</key>\n        <string>PROFILE-UUID</string>');
    expect(options).toContain(
        '<key>chat.haus.ios.NotificationService</key>\n        <string>EXTENSION-UUID</string>'
    );
    expect(options).toContain('<key>destination</key>\n    <string>export</string>');
    expect(() =>
        appStoreConnectExportOptions('TEAM<bad', { 'chat.haus.ios': 'PROFILE-UUID' })
    ).toThrow('team ID contains unsupported characters');
    expect(() => appStoreConnectExportOptions('TEAM123', { 'chat.haus.ios': 'bad<uuid' })).toThrow(
        'provisioning profile specifier contains unsupported characters'
    );
    expect(() => appStoreConnectExportOptions('TEAM123', {})).toThrow('at least one');
});

test('requires the exact declared iOS release', () => {
    const release = {
        targets: {
            server: null,
            app: null,
            ios: { buildNumber: 7, version: '1.0.0' },
            computer: null,
        },
    };
    expect(() => assertIOSReleaseTarget(release, '1.0.0', 7)).not.toThrow();
    expect(() => assertIOSReleaseTarget(release, '1.0.1', 7)).toThrow('does not match 1.0.1');
});

test('uses App Store Connect authentication only as a complete set', () => {
    expect(appStoreConnectAuthenticationArgs({})).toEqual([]);
    expect(() => appStoreConnectAuthenticationArgs({ APPLE_API_KEY_ID: 'KEY' })).toThrow(
        'must be set together'
    );
    expect(
        appStoreConnectAuthenticationArgs({
            APPLE_API_ISSUER: 'issuer',
            APPLE_API_KEY_ID: 'KEY',
            APPLE_API_KEY_PATH: '/tmp/AuthKey.p8',
        })
    ).toEqual([
        '-authenticationKeyPath',
        '/tmp/AuthKey.p8',
        '-authenticationKeyID',
        'KEY',
        '-authenticationKeyIssuerID',
        'issuer',
    ]);
});

test('uploads the exported IPA separately with the same API key', () => {
    const args = appStoreConnectUploadArgs('/tmp/Haus.ipa', {
        APPLE_API_ISSUER: 'issuer',
        APPLE_API_KEY_ID: 'KEY',
        APPLE_API_KEY_PATH: '/tmp/AuthKey.p8',
    });
    expect(args).toEqual([
        'altool',
        '--upload-app',
        '-f',
        '/tmp/Haus.ipa',
        '-t',
        'ios',
        '--api-key',
        'KEY',
        '--api-issuer',
        'issuer',
        '--p8-file-path',
        '/tmp/AuthKey.p8',
        '--output-format',
        'json',
    ]);
});
