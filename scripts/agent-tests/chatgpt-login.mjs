import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { insertSignedInConnection } from '../../apps/server/src/model-connections/write-model-connections.ts';
import { connectHausDatabase } from '../../apps/server/src/postgres/connection.ts';
import { parseSecretsKey } from '../../apps/server/src/secrets/sealed-secret.ts';
import { createDevStackStatePaths } from '../dev-stack-shared.mjs';

export const codexAuthPath = path.join(homedir(), '.codex', 'auth.json');

export async function seedChatgptLogin(harness, { label, env = process.env } = {}) {
    const encodedKey = env.HAUS_SECRETS_KEY;
    if (!encodedKey) {
        throw new Error(
            'A ChatGPT eval login needs HAUS_SECRETS_KEY: run through `bun run eval` or varlock.'
        );
    }
    const credential = codexCredential(readCodexAuth());
    // WARNING: ChatGPT refresh tokens rotate. A refresh here signs the Codex CLI out.
    if (credential.expires - Date.now() < minimumValidityMs) {
        throw new Error(
            'The Codex CLI access token expires within 6 hours; run any `codex` command to refresh it, then rerun.'
        );
    }
    const database = await connectHausDatabase(stackDatabaseUrl());
    try {
        const connectionId = await insertSignedInConnection(
            database.db,
            parseSecretsKey(encodedKey),
            {
                credential: { credential, kind: 'oauth' },
                label,
                provider: 'chatgpt',
                serverId: harness.serverId,
            }
        );
        await harness.trpc('modelConnections.setWebSearch', {
            connectionId,
            enabled: true,
            serverId: harness.serverId,
        });
        return connectionId;
    } finally {
        await database.close();
    }
}

export function codexCredential(auth) {
    const tokens = auth?.tokens;
    if (!(tokens?.access_token && tokens.refresh_token)) {
        throw new Error(`${codexAuthPath} holds no ChatGPT sign-in; run \`codex login\`.`);
    }
    const claims = JSON.parse(
        Buffer.from(tokens.access_token.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    const accountId = claims['https://api.openai.com/auth']?.chatgpt_account_id;
    if (!(typeof claims.exp === 'number' && typeof accountId === 'string' && accountId)) {
        throw new Error(`${codexAuthPath} holds an access token without an expiry or account.`);
    }
    return {
        access: tokens.access_token,
        accountId,
        expires: claims.exp * 1000,
        refresh: tokens.refresh_token,
    };
}

const minimumValidityMs = 6 * 60 * 60 * 1000;

function readCodexAuth() {
    try {
        return JSON.parse(readFileSync(codexAuthPath, 'utf8'));
    } catch (cause) {
        throw new Error(`No Codex CLI login at ${codexAuthPath}; run \`codex login\`.`, { cause });
    }
}

function stackDatabaseUrl() {
    const { postgresSocketRoot } = createDevStackStatePaths({
        baseEnvironment: process.env,
        repositoryRoot: process.cwd(),
    });
    const socket = readdirSync(postgresSocketRoot).find((entry) =>
        /^\.s\.PGSQL\.\d+$/u.test(entry)
    );
    if (!socket) {
        throw new Error(`No PostgreSQL socket under ${postgresSocketRoot}; is the dev stack up?`);
    }
    return `postgres://haus@127.0.0.1:${socket.split('.').at(-1)}/haus`;
}
