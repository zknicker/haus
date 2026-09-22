import { expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import computerProtocol from '../../packages/haus-api/computer-protocol.json' with { type: 'json' };
import {
    assertComputerReleaseKey,
    assertNewerComputerVersion,
    computerProtocolVersion,
    computerReleaseSigningPayload,
    createSignedComputerRelease,
    publishComputerInOrder,
    verifySignedComputerRelease,
} from './computer-release-contract.mjs';

test('Computer publisher uses the canonical ordinary protocol version', () => {
    expect(computerProtocolVersion).toBe(computerProtocol.version);
    expect(computerProtocolVersion).toBe(23);
});

const release = {
    artifactUrl: 'https://releases.haus.chat/computer/1.1.0/haus-computer-aarch64-apple-darwin',
    protocolVersion: 3,
    sha256: 'a'.repeat(64),
    sourceRevision: 'b'.repeat(40),
    version: '1.1.0',
};

test('Computer release descriptor is canonical and fails closed', () => {
    const keys = generateKeyPairSync('ed25519');
    const descriptor = createSignedComputerRelease(release, keys.privateKey);
    expect(computerReleaseSigningPayload(release)).toBe(
        `{"artifactUrl":"${release.artifactUrl}","protocolVersion":3,"sha256":"${release.sha256}","sourceRevision":"${release.sourceRevision}","version":"1.1.0"}`
    );
    expect(() => verifySignedComputerRelease(descriptor, keys.publicKey)).not.toThrow();
    expect(() =>
        verifySignedComputerRelease(
            {
                ...descriptor,
                release: { ...descriptor.release, sha256: 'c'.repeat(64) },
            },
            keys.publicKey
        )
    ).toThrow('signature verification failed');
});

test('failed immutable verification never promotes latest', async () => {
    const calls = [];
    await expect(
        publishComputerInOrder({
            promoteLatest: async () => {
                calls.push('promote');
            },
            publishImmutable: async () => {
                calls.push('publish');
            },
            verifyImmutable: async () => {
                calls.push('verify');
                throw new Error('public artifact rejected');
            },
            verifyLatest: async () => {
                calls.push('latest');
            },
        })
    ).rejects.toThrow('public artifact rejected');
    expect(calls).toEqual(['publish', 'verify']);
});

test('release key and production SemVer continuity fail closed', () => {
    const trusted = generateKeyPairSync('ed25519');
    const rotated = generateKeyPairSync('ed25519');
    expect(() =>
        assertComputerReleaseKey(
            trusted.privateKey,
            trusted.publicKey.export({ format: 'pem', type: 'spki' })
        )
    ).not.toThrow();
    expect(() =>
        assertComputerReleaseKey(
            rotated.privateKey,
            trusted.publicKey.export({ format: 'pem', type: 'spki' })
        )
    ).toThrow('does not match');
    expect(() => assertNewerComputerVersion('1.1.0', '1.0.9')).not.toThrow();
    expect(() => assertNewerComputerVersion('1.0.9', '1.1.0')).toThrow('not newer');
    expect(() => assertNewerComputerVersion('1.1.0', '1.1.0')).toThrow('not newer');
});
