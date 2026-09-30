import { createPrivateKey, sign } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const IOS_BUNDLE_ID = 'chat.haus.ios';

/**
 * Every signed bundle in the IPA needs its own App Store profile: the app and
 * its Notification Service extension. `cleanupVariable` names the GITHUB_ENV
 * key cleanup-apple-material.sh deletes after the job.
 */
export const IOS_RELEASE_PROFILES = Object.freeze([
    Object.freeze({
        bundleId: IOS_BUNDLE_ID,
        cleanupVariable: 'HAUS_RELEASE_PROVISIONING_PROFILE_PATH',
        name: 'Haus CI App Store',
    }),
    Object.freeze({
        bundleId: `${IOS_BUNDLE_ID}.NotificationService`,
        cleanupVariable: 'HAUS_RELEASE_NOTIFICATION_SERVICE_PROVISIONING_PROFILE_PATH',
        name: 'Haus CI App Store NotificationService',
    }),
]);

const profilesEndpoint = 'https://api.appstoreconnect.apple.com/v1/profiles';

export async function installIOSProvisioningProfile(release, options = {}) {
    const environment = options.environment ?? process.env;
    const fetchImpl = options.fetchImpl ?? fetch;
    const now = options.now ?? Date.now();
    const home = options.home ?? homedir();
    const credentials = readCredentials(environment);
    const token = createAppStoreConnectToken({ ...credentials, now });
    const response = await fetchImpl(profilesRequestURL(release.name), {
        headers: { Authorization: `Bearer ${token}` },
        signal: options.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new Error(`App Store Connect profiles request failed with status ${response.status}`);
    }

    const profile = selectProfile(await response.json(), release, now);
    const profileDirectory = path.join(
        home,
        'Library',
        'Developer',
        'Xcode',
        'UserData',
        'Provisioning Profiles'
    );
    const profilePath = path.join(profileDirectory, `${profile.uuid}.mobileprovision`);
    mkdirSync(profileDirectory, { mode: 0o700, recursive: true });
    writeFileSync(profilePath, profile.content, { mode: 0o600 });
    exposeCleanupPath(environment.GITHUB_ENV, release.cleanupVariable, profilePath);
    return {
        bundleId: release.bundleId,
        name: profile.name,
        path: profilePath,
        uuid: profile.uuid,
    };
}

export function createAppStoreConnectToken({ apiKeyId, issuerId, privateKey, now = Date.now() }) {
    const issuedAt = Math.floor(now / 1000);
    const header = encodeJSON({ alg: 'ES256', kid: apiKeyId, typ: 'JWT' });
    const payload = encodeJSON({
        aud: 'appstoreconnect-v1',
        exp: issuedAt + 15 * 60,
        iat: issuedAt,
        iss: issuerId,
    });
    const signingInput = `${header}.${payload}`;
    const signature = sign('sha256', Buffer.from(signingInput), {
        dsaEncoding: 'ieee-p1363',
        key: createPrivateKey(privateKey),
    });
    return `${signingInput}.${signature.toString('base64url')}`;
}

function readCredentials(environment) {
    const apiKeyId = environment.APPLE_API_KEY_ID;
    const issuerId = environment.APPLE_API_ISSUER;
    const keyPath = environment.APPLE_API_KEY_PATH;
    if (!(apiKeyId && issuerId && keyPath)) {
        throw new Error(
            'APPLE_API_KEY_PATH, APPLE_API_KEY_ID, and APPLE_API_ISSUER are required to fetch the iOS provisioning profile'
        );
    }
    return { apiKeyId, issuerId, privateKey: readFileSync(path.resolve(keyPath), 'utf8') };
}

function profilesRequestURL(name) {
    const url = new URL(profilesEndpoint);
    url.searchParams.set('filter[name]', name);
    url.searchParams.set('filter[profileType]', 'IOS_APP_STORE');
    url.searchParams.set('filter[profileState]', 'ACTIVE');
    url.searchParams.set('include', 'bundleId');
    url.searchParams.set(
        'fields[profiles]',
        'name,uuid,profileContent,expirationDate,profileState,profileType,bundleId'
    );
    url.searchParams.set('fields[bundleIds]', 'identifier');
    return url;
}

function selectProfile(document, release, now) {
    // Apple's name filter also returns profiles whose names contain the query.
    const profiles = (Array.isArray(document?.data) ? document.data : []).filter(
        (profile) => profile?.attributes?.name === release.name
    );
    if (profiles.length !== 1) {
        throw new Error(
            `expected exactly one active ${release.name} profile, found ${profiles.length}`
        );
    }
    const profile = profiles[0];
    const attributes = profile?.attributes;
    if (
        attributes?.name !== release.name ||
        attributes?.profileType !== 'IOS_APP_STORE' ||
        attributes?.profileState !== 'ACTIVE'
    ) {
        throw new Error(
            'App Store provisioning profile does not match the requested release profile'
        );
    }
    const uuid = attributes?.uuid;
    if (!(typeof uuid === 'string' && /^[0-9A-F-]+$/iu.test(uuid))) {
        throw new Error('App Store provisioning profile has an invalid UUID');
    }
    if (!(new Date(attributes.expirationDate).getTime() > now)) {
        throw new Error('App Store provisioning profile is expired');
    }
    const bundleId = profile?.relationships?.bundleId?.data?.id;
    const includedBundle = document.included?.find(
        (entry) => entry?.type === 'bundleIds' && entry.id === bundleId
    );
    if (includedBundle?.attributes?.identifier !== release.bundleId) {
        throw new Error(`App Store provisioning profile does not belong to ${release.bundleId}`);
    }
    const encodedContent = attributes.profileContent;
    if (!(typeof encodedContent === 'string' && encodedContent.length > 0)) {
        throw new Error('App Store provisioning profile content is empty');
    }
    const content = Buffer.from(encodedContent, 'base64');
    if (content.length === 0) {
        throw new Error('App Store provisioning profile content is empty');
    }
    return { content, name: attributes.name, uuid };
}

function exposeCleanupPath(githubEnvironmentPath, variable, profilePath) {
    if (!githubEnvironmentPath) {
        return;
    }
    appendFileSync(githubEnvironmentPath, `${variable}=${profilePath}\n`, 'utf8');
}

function encodeJSON(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}
