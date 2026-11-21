import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createConnectionBook } from '../../../apps/runner/src/model-connections/connection-book.ts';
import {
    readRunnerConnections,
    storeRotatedCredential,
} from '../../../apps/server/src/model-connections/runner-connection-store.ts';
import { connectHausDatabase } from '../../../apps/server/src/postgres/connection.ts';
import { parseSecretsKey } from '../../../apps/server/src/secrets/sealed-secret.ts';
import { modelProviderFor } from '../../../packages/haus-api/src/index.ts';
import { createDevStackEnvironment } from '../../dev-stack-shared.mjs';

export async function openLabConnection({ modelId, repositoryRoot }) {
    const encodedKey = process.env.HAUS_SECRETS_KEY;
    if (!encodedKey) {
        throw new Error('HAUS_SECRETS_KEY is not set; start the lab with `bun run visuals:lab`.');
    }
    const key = parseSecretsKey(encodedKey);
    const database = await connectHausDatabase(devDatabaseUrl(repositoryRoot));
    const provider = modelProviderFor(modelId);
    const connection = (await readRunnerConnections(database.db, key)).find(
        (candidate) => candidate.provider === provider
    );
    if (!connection) {
        await database.close();
        throw new Error(
            `the dev Server has no enabled ${provider} Model connection; add one in Settings, Models`
        );
    }
    const book = createConnectionBook();
    await book.replace([connection]);
    const link = {
        send(frame) {
            if (frame.type === 'runner-connection-credential') {
                void storeRotation({ book, database, frame, key, link });
            }
        },
    };
    return { book, close: () => database.close(), connection, link };
}

async function storeRotation({ book, database, frame, key, link }) {
    const ack = {
        connectionId: frame.connectionId,
        rotationId: frame.rotationId,
        type: 'runner-connection-credential-ack',
    };
    try {
        const stored = await storeRotatedCredential(database.db, key, frame);
        await book.acknowledge(
            { ...ack, credentialVersion: stored.credentialVersion, result: stored.result },
            link
        );
        await book.replace(
            (await readRunnerConnections(database.db, key)).filter(
                (connection) => connection.id === frame.connectionId
            )
        );
    } catch (error) {
        process.stderr.write(`rotated credential for ${frame.connectionId} not stored: ${error}\n`);
        await book.acknowledge(
            { ...ack, credentialVersion: frame.baseVersion, result: 'failed' },
            link
        );
    }
}

function devDatabaseUrl(repositoryRoot) {
    const dataRoot = createDevStackEnvironment({ repositoryRoot }).HAUS_POSTGRES_DATA_ROOT;
    let pidFile;
    try {
        pidFile = readFileSync(path.join(dataRoot, 'postmaster.pid'), 'utf8');
    } catch (cause) {
        throw new Error(
            `no dev database is running at ${dataRoot}; start it with \`bun run dev\``,
            {
                cause,
            }
        );
    }
    const port = Number(pidFile.split('\n')[3]);
    if (!Number.isInteger(port)) {
        throw new Error(`${dataRoot}/postmaster.pid names no port`);
    }
    return `postgres://haus@127.0.0.1:${port}/haus`;
}
