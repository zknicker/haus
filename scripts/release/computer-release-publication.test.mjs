import { expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import {
    assertNewerComputerVersion,
    createSignedComputerRelease,
} from './computer-release-contract.mjs';
import {
    assertImmutableObjectAbsent,
    computerReleaseIsAlreadyPublished,
    ensureImmutableObject,
    immutableObjectExists,
    readProductionComputerRelease,
} from './computer-release-publication.mjs';

test('an absent immutable S3 key accepts both AWS CLI missing-object results', () => {
    const missingEmpty = () => ({ status: 0, stderr: '', stdout: '' });
    const missingStatus = () => ({ status: 1, stderr: '', stdout: '' });
    const existing = () => ({
        status: 0,
        stderr: '',
        stdout: '2026-07-28 1 artifact\n',
    });
    const failed = () => ({ status: 1, stderr: 'AccessDenied', stdout: '' });

    expect(() => assertImmutableObjectAbsent('s3://bucket/key', missingEmpty)).not.toThrow();
    expect(() => assertImmutableObjectAbsent('s3://bucket/key', missingStatus)).not.toThrow();
    expect(() => assertImmutableObjectAbsent('s3://bucket/key', existing)).toThrow(
        'already exists'
    );
    expect(() => assertImmutableObjectAbsent('s3://bucket/key', failed)).toThrow('Could not check');
    expect(immutableObjectExists('s3://bucket/key', existing)).toBe(true);
    expect(immutableObjectExists('s3://bucket/key', missingEmpty)).toBe(false);
});

test('an interrupted publish reuses only byte-identical immutable objects', async () => {
    const copies = [];
    await expect(
        ensureImmutableObject('/local', 's3://bucket/key', {
            copy: (source, destination) => copies.push([source, destination]),
            exists: () => false,
        })
    ).resolves.toBe('published');
    expect(copies).toEqual([['/local', 's3://bucket/key']]);

    await expect(
        ensureImmutableObject('/local', 's3://bucket/key', {
            exists: () => true,
            readRemoteSha256: async () => 'same',
            sha256: async () => 'same',
        })
    ).resolves.toBe('reused');
    await expect(
        ensureImmutableObject('/local', 's3://bucket/key', {
            exists: () => true,
            readRemoteSha256: async () => 'remote',
            sha256: async () => 'local',
        })
    ).rejects.toThrow('differs from local release');
});

test('production release reads verify continuity and allow only an initial 404', async () => {
    const trusted = generateKeyPairSync('ed25519');
    const untrusted = generateKeyPairSync('ed25519');
    const descriptor = createSignedComputerRelease(
        {
            artifactUrl:
                'https://releases.haus.chat/computer/1.1.0/haus-computer-aarch64-apple-darwin',
            protocolVersion: 3,
            sha256: 'a'.repeat(64),
            sourceRevision: 'b'.repeat(40),
            version: '1.1.0',
        },
        trusted.privateKey
    );
    const request = async () => Response.json(descriptor);

    await expect(
        readProductionComputerRelease(
            'https://releases.haus.chat/computer/latest.json',
            trusted.publicKey,
            request
        )
    ).resolves.toEqual(descriptor);
    await expect(
        readProductionComputerRelease(
            'https://releases.haus.chat/computer/latest.json',
            untrusted.publicKey,
            request
        )
    ).rejects.toThrow('signature verification failed');
    await expect(
        readProductionComputerRelease(
            'https://releases.haus.chat/computer/latest.json',
            trusted.publicKey,
            async () => new Response(null, { status: 404 })
        )
    ).resolves.toBeNull();
});

test('a re-run completes only the exact artifact already promoted to production', () => {
    const production = {
        release: {
            artifactUrl:
                'https://releases.haus.chat/computer/1.7.0/haus-computer-aarch64-apple-darwin',
            protocolVersion: 12,
            sha256: 'c'.repeat(64),
            sourceRevision: 'd'.repeat(40),
            version: '1.7.0',
        },
    };
    const candidate = {
        sha256: 'c'.repeat(64),
        sourceRevision: 'd'.repeat(40),
        version: '1.7.0',
    };

    expect(computerReleaseIsAlreadyPublished(production, candidate)).toBe(true);
    expect(computerReleaseIsAlreadyPublished(null, candidate)).toBe(false);
    expect(
        computerReleaseIsAlreadyPublished(production, { ...candidate, sha256: 'e'.repeat(64) })
    ).toBe(false);
    expect(
        computerReleaseIsAlreadyPublished(production, {
            ...candidate,
            sourceRevision: 'f'.repeat(40),
        })
    ).toBe(false);
    expect(computerReleaseIsAlreadyPublished(production, { ...candidate, version: '1.6.1' })).toBe(
        false
    );
});

test('a candidate that is not the published artifact still meets the newer-version guard', () => {
    const production = {
        release: {
            artifactUrl:
                'https://releases.haus.chat/computer/1.7.0/haus-computer-aarch64-apple-darwin',
            protocolVersion: 12,
            sha256: 'c'.repeat(64),
            sourceRevision: 'd'.repeat(40),
            version: '1.7.0',
        },
    };

    // Same version rebuilt from a different source revision is not the published artifact.
    expect(
        computerReleaseIsAlreadyPublished(production, {
            sha256: 'e'.repeat(64),
            sourceRevision: 'f'.repeat(40),
            version: '1.7.0',
        })
    ).toBe(false);
    expect(() => assertNewerComputerVersion('1.7.0', production.release.version)).toThrow(
        'is not newer than production 1.7.0'
    );
    expect(() => assertNewerComputerVersion('1.6.1', production.release.version)).toThrow(
        'is not newer than production 1.7.0'
    );
    expect(() => assertNewerComputerVersion('1.7.1', production.release.version)).not.toThrow();
});
