import { afterEach, expect, test } from 'bun:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
    createAppStoreConnectToken,
    IOS_RELEASE_PROFILES,
    installIOSProvisioningProfile,
} from './ios-provisioning-profile.mjs';

const [appProfile, notificationServiceProfile] = IOS_RELEASE_PROFILES;

const temporaryDirectories = [];
const now = Date.parse('2026-08-28T00:00:00Z');

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { force: true, recursive: true });
    }
});

test('downloads the one active App Store profile into the Xcode 16+ profile directory', async () => {
    const fixture = createFixture();
    let request;
    const result = await installIOSProvisioningProfile(appProfile, {
        environment: fixture.environment,
        fetchImpl: async (url, options) => {
            request = { options, url: String(url) };
            return Response.json(profileDocument());
        },
        home: fixture.home,
        now,
    });

    const requestURL = new URL(request.url);
    expect(requestURL.searchParams.get('filter[name]')).toBe('Haus CI App Store');
    expect(requestURL.searchParams.get('filter[profileType]')).toBe('IOS_APP_STORE');
    expect(requestURL.searchParams.get('filter[profileState]')).toBe('ACTIVE');
    expect(request.options.headers.Authorization).toStartWith('Bearer ');
    expect(result.uuid).toBe('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
    expect(result.bundleId).toBe('chat.haus.ios');
    expect(result.path).toBe(
        path.join(
            fixture.home,
            'Library/Developer/Xcode/UserData/Provisioning Profiles',
            'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE.mobileprovision'
        )
    );
    expect(readFileSync(result.path, 'utf8')).toBe('signed profile bytes');
    expect(readFileSync(fixture.environment.GITHUB_ENV, 'utf8')).toContain(
        `HAUS_RELEASE_PROVISIONING_PROFILE_PATH=${result.path}`
    );
});

test('installs the Notification Service extension profile under its own cleanup key', async () => {
    const fixture = createFixture();
    let requestURL;
    const result = await installIOSProvisioningProfile(notificationServiceProfile, {
        environment: fixture.environment,
        fetchImpl: async (url) => {
            requestURL = new URL(String(url));
            return Response.json(
                profileDocument(
                    {
                        name: 'Haus CI App Store NotificationService',
                        uuid: '11111111-2222-3333-4444-555555555555',
                    },
                    'chat.haus.ios.NotificationService'
                )
            );
        },
        home: fixture.home,
        now,
    });

    expect(requestURL.searchParams.get('filter[name]')).toBe(
        'Haus CI App Store NotificationService'
    );
    expect(result.bundleId).toBe('chat.haus.ios.NotificationService');
    expect(readFileSync(fixture.environment.GITHUB_ENV, 'utf8')).toBe(
        `HAUS_RELEASE_NOTIFICATION_SERVICE_PROVISIONING_PROFILE_PATH=${result.path}\n`
    );
    await expect(
        installIOSProvisioningProfile(notificationServiceProfile, {
            environment: fixture.environment,
            fetchImpl: async () => Response.json(profileDocument()),
            home: fixture.home,
            now,
        })
    ).rejects.toThrow('does not match the requested release profile');
});

test('signs a valid short-lived App Store Connect JWT', () => {
    const fixture = createFixture();
    const token = createAppStoreConnectToken({
        apiKeyId: fixture.environment.APPLE_API_KEY_ID,
        issuerId: fixture.environment.APPLE_API_ISSUER,
        now,
        privateKey: fixture.privateKey,
    });
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
        alg: 'ES256',
        kid: 'TESTKEY',
        typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
        aud: 'appstoreconnect-v1',
        exp: Math.floor(now / 1000) + 900,
        iat: Math.floor(now / 1000),
        iss: 'test-issuer',
    });
    expect(
        verify(
            'sha256',
            Buffer.from(`${header}.${payload}`),
            { dsaEncoding: 'ieee-p1363', key: fixture.publicKey },
            Buffer.from(signature, 'base64url')
        )
    ).toBe(true);
});

test('refuses ambiguous, expired, or wrong-bundle profiles', async () => {
    const fixture = createFixture();
    const install = (document) =>
        installIOSProvisioningProfile(appProfile, {
            environment: fixture.environment,
            fetchImpl: async () => Response.json(document),
            home: fixture.home,
            now,
        });

    await expect(install({ data: [], included: [] })).rejects.toThrow('found 0');
    await expect(
        install(profileDocument({ expirationDate: '2026-08-27T23:59:59Z' }))
    ).rejects.toThrow('expired');
    await expect(install(profileDocument({}, 'other.bundle'))).rejects.toThrow('chat.haus.ios');
    expect(existsSync(path.join(fixture.home, 'Library/Developer/Xcode'))).toBe(false);
});

function createFixture() {
    const home = mkdtempSync(path.join(tmpdir(), 'haus-ios-profile-'));
    temporaryDirectories.push(home);
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const privateKeyPEM = privateKey.export({ format: 'pem', type: 'pkcs8' });
    const keyPath = path.join(home, 'AuthKey_TESTKEY.p8');
    const githubEnvironmentPath = path.join(home, 'github-env');
    writeFileSync(keyPath, privateKeyPEM);
    writeFileSync(githubEnvironmentPath, '');
    return {
        environment: {
            APPLE_API_ISSUER: 'test-issuer',
            APPLE_API_KEY_ID: 'TESTKEY',
            APPLE_API_KEY_PATH: keyPath,
            GITHUB_ENV: githubEnvironmentPath,
        },
        home,
        privateKey: privateKeyPEM,
        publicKey,
    };
}

function profileDocument(attributeOverrides = {}, bundleIdentifier = 'chat.haus.ios') {
    return {
        data: [
            {
                attributes: {
                    expirationDate: '2027-08-27T00:00:00Z',
                    name: 'Haus CI App Store',
                    profileContent: Buffer.from('signed profile bytes').toString('base64'),
                    profileState: 'ACTIVE',
                    profileType: 'IOS_APP_STORE',
                    uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
                    ...attributeOverrides,
                },
                relationships: { bundleId: { data: { id: 'bundle-id', type: 'bundleIds' } } },
                type: 'profiles',
            },
        ],
        included: [
            {
                attributes: { identifier: bundleIdentifier },
                id: 'bundle-id',
                type: 'bundleIds',
            },
        ],
    };
}
