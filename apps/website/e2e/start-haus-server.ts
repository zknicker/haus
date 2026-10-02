import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computerProtocolVersion } from '@haus/api';
import { bootstrapHausDatabase } from '../../server/src/postgres/bootstrap.ts';
import { startClerkTestIssuer } from '../../server/test/clerk-test-issuer.ts';
import { startPostgresCluster } from '../../server/test/postgres-cluster.ts';
import {
    clerkSessionFile,
    e2eClerkUserId,
    e2eHumanEmail,
    e2ePeerClerkUserId,
    e2ePeerEmail,
} from './support/clerk-session.ts';

/**
 * Starts the hosted Haus Server for e2e: a throwaway PostgreSQL cluster and a
 * local Clerk issuer, with the session token the browser will present written
 * where the specs read it. The pre-WS6 local sidecar is a separate process.
 */
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const stateDirectory = fileURLToPath(new URL('../../../.context/e2e/', import.meta.url));
const clerkSessionPath = clerkSessionFile();
const attachmentRoot = mkdtempSync(join(tmpdir(), 'haus-e2e-attachments-'));
// The browser is the frontend that asks Clerk for the session, so it is the
// authorized party the Server binds to.
const appOrigin = process.env.HAUS_APP_ORIGIN ?? 'http://127.0.0.1:3101';

mkdirSync(stateDirectory, { recursive: true });
rmSync(clerkSessionPath, { force: true });

const cluster = await startPostgresCluster();
const clerk = await startClerkTestIssuer(appOrigin, { sessionTokenLifetimeSeconds: 3600 });
const computerReleaseServer = Bun.serve({
    async fetch() {
        await Bun.sleep(400);
        return Response.json({
            release: {
                artifactUrl: 'https://updates.haus.test/1.1.0/haus-computer-aarch64-apple-darwin',
                protocolVersion: computerProtocolVersion,
                sha256: 'a'.repeat(64),
                sourceRevision: 'b'.repeat(40),
                version: '1.1.0',
            },
            signature: Buffer.alloc(64, 1).toString('base64'),
        });
    },
    hostname: '127.0.0.1',
    port: 0,
});
await bootstrapHausDatabase(cluster.databaseUrl, 'haus');

// The invitation boundary asks Clerk which of a human's addresses are verified.
// The local issuer answers that too, so e2e drives the real acceptance path.
clerk.setVerifiedEmails(e2eClerkUserId, [e2eHumanEmail]);
clerk.setVerifiedEmails(e2ePeerClerkUserId, [e2ePeerEmail]);

process.once('exit', () => {
    rmSync(clerkSessionPath, { force: true });
    rmSync(attachmentRoot, { force: true, recursive: true });
    computerReleaseServer.stop(true);
    void cluster.stop();
});
process.once('SIGTERM', () => {
    void shutdown();
});
process.once('SIGINT', () => {
    void shutdown();
});

writeFileSync(
    clerkSessionPath,
    JSON.stringify({
        databaseUrl: cluster.databaseUrl,
        peerEmail: e2ePeerEmail,
        peerToken: await clerk.mintSessionToken(e2ePeerClerkUserId),
        rotatedToken: await clerk.mintSessionToken(e2eClerkUserId, { rotation: 'second' }),
        token: await clerk.mintSessionToken(e2eClerkUserId),
    })
);

process.env.NODE_ENV = 'test';
process.env.HAUS_APP_ORIGIN = appOrigin;
process.env.HAUS_CLERK_API_URL = clerk.url;
process.env.HAUS_CLERK_ISSUER_URL = clerk.url;
process.env.HAUS_CLERK_SECRET_KEY = 'sk_test_haus_e2e';
process.env.HAUS_DATABASE_URL = cluster.databaseUrl;
process.env.HAUS_ATTACHMENT_ROOT = attachmentRoot;
process.env.HAUS_COMPUTER_RELEASE_MANIFEST_URL = `http://127.0.0.1:${computerReleaseServer.port}/latest.json`;

process.chdir(workspaceRoot);

await import('../../server/src/haus-server.ts');

let shuttingDown = false;

async function shutdown() {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    await clerk.close();
    computerReleaseServer.stop(true);
    await cluster.stop();
    rmSync(clerkSessionPath, { force: true });
    rmSync(attachmentRoot, { force: true, recursive: true });
    process.exit(0);
}
