import { createHash, createPublicKey, sign, timingSafeEqual, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import computerProtocol from '../../packages/haus-api/computer-protocol.json' with { type: 'json' };

export const computerProtocolVersion = computerProtocol.version;
export const computerArtifactName = 'haus-computer-aarch64-apple-darwin';

export function computerReleaseSigningPayload(release) {
    return JSON.stringify({
        artifactUrl: release.artifactUrl,
        protocolVersion: release.protocolVersion,
        sha256: release.sha256,
        sourceRevision: release.sourceRevision,
        version: release.version,
    });
}

export function createSignedComputerRelease(release, privateKey) {
    validateComputerRelease(release);
    return {
        release,
        signature: sign(
            null,
            Buffer.from(computerReleaseSigningPayload(release)),
            privateKey
        ).toString('base64'),
    };
}

export function verifySignedComputerRelease(descriptor, publicKey) {
    validateSignedComputerRelease(descriptor);
    if (
        !verify(
            null,
            Buffer.from(computerReleaseSigningPayload(descriptor.release)),
            publicKey,
            Buffer.from(descriptor.signature, 'base64')
        )
    ) {
        throw new Error('Computer release descriptor signature verification failed.');
    }
}

export function publicKeyFromPrivate(privateKey) {
    return createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString();
}

export function assertComputerReleaseKey(privateKey, expectedPublicKey) {
    const derived = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
    const expected = createPublicKey(expectedPublicKey).export({ format: 'der', type: 'spki' });
    if (derived.length !== expected.length || !timingSafeEqual(derived, expected)) {
        throw new Error('Computer release private key does not match the trusted public key.');
    }
}

export function assertNewerComputerVersion(candidate, current) {
    validateVersion(candidate);
    validateVersion(current);
    const candidateParts = candidate.split('.').map(Number);
    const currentParts = current.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) {
        if (candidateParts[index] !== currentParts[index]) {
            if ((candidateParts[index] ?? 0) > (currentParts[index] ?? 0)) {
                return;
            }
            break;
        }
    }
    throw new Error(`Computer ${candidate} is not newer than production ${current}.`);
}

export async function sha256File(path) {
    return createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
}

export async function publishComputerInOrder(steps) {
    await steps.publishImmutable();
    await steps.verifyImmutable();
    await steps.promoteLatest();
    await steps.verifyLatest();
}

export function validateSignedComputerRelease(value) {
    if (
        !(isRecord(value) && hasExactKeys(value, ['release', 'signature'])) ||
        typeof value.signature !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/u.test(value.signature)
    ) {
        throw new Error('Computer release descriptor is invalid.');
    }
    validateComputerRelease(value.release);
}

export function validateComputerRelease(value) {
    if (
        !(
            isRecord(value) &&
            hasExactKeys(value, [
                'artifactUrl',
                'protocolVersion',
                'sha256',
                'sourceRevision',
                'version',
            ]) &&
            isUrl(value.artifactUrl) &&
            Number.isSafeInteger(value.protocolVersion)
        ) ||
        value.protocolVersion < 1 ||
        !/^[a-f0-9]{64}$/u.test(value.sha256) ||
        !/^[a-f0-9]{40}$/u.test(value.sourceRevision) ||
        !isVersion(value.version)
    ) {
        throw new Error('Computer release identity is invalid.');
    }
}

function validateVersion(value) {
    if (!isVersion(value)) {
        throw new Error(`Invalid Computer SemVer: ${value}.`);
    }
}

function isVersion(value) {
    return typeof value === 'string' && /^\d+\.\d+\.\d+$/u.test(value);
}

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isUrl(value) {
    try {
        return typeof value === 'string' && new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}
