import { expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { checkComputerReleasePrerequisite } from './check-computer-prerequisite.mjs';
import {
    computerProtocolVersion,
    createSignedComputerRelease,
} from './computer-release-contract.mjs';

test('Server publishing refuses a production Computer below its protocol floor', async () => {
    const keys = generateKeyPairSync('ed25519');
    const server = serveDescriptor(
        createSignedComputerRelease(
            {
                artifactUrl:
                    'https://releases.haus.chat/computer/1.0.0/haus-computer-aarch64-apple-darwin',
                protocolVersion: 2,
                sha256: 'a'.repeat(64),
                sourceRevision: 'b'.repeat(40),
                version: '1.0.0',
            },
            keys.privateKey
        )
    );
    try {
        await expect(
            checkComputerReleasePrerequisite(
                `http://127.0.0.1:${server.port}/latest.json`,
                keys.publicKey
            )
        ).rejects.toThrow(`below required protocol ${computerProtocolVersion}`);
    } finally {
        server.stop(true);
    }
});

test('Server publishing verifies the production descriptor signature', async () => {
    const trusted = generateKeyPairSync('ed25519');
    const untrusted = generateKeyPairSync('ed25519');
    const server = serveDescriptor(
        createSignedComputerRelease(
            {
                artifactUrl:
                    'https://releases.haus.chat/computer/1.1.0/haus-computer-aarch64-apple-darwin',
                protocolVersion: 3,
                sha256: 'a'.repeat(64),
                sourceRevision: 'b'.repeat(40),
                version: '1.1.0',
            },
            untrusted.privateKey
        )
    );
    try {
        await expect(
            checkComputerReleasePrerequisite(
                `http://127.0.0.1:${server.port}/latest.json`,
                trusted.publicKey
            )
        ).rejects.toThrow('signature verification failed');
    } finally {
        server.stop(true);
    }
});

function serveDescriptor(descriptor) {
    return Bun.serve({
        fetch: () => Response.json(descriptor),
        port: 0,
    });
}
