import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';

export interface ClaudeCloudComputer {
    credentialHash: string;
    dataRoot: string;
    serverId: string;
    serverOrigin: string;
}
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export function isNativeClaudeCloudOrigin(origin: string): boolean {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return (
        url.protocol === 'https:' &&
        host !== 'localhost' &&
        !host.endsWith('.localhost') &&
        !host.endsWith('.local') &&
        host !== '[::1]' &&
        !/^(?:127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(host)
    );
}

/** Dedicated connection secret grants only admitted-work bootstrap; never carries an Agent token. */
export async function prepareClaudeCloudBootstrap(computer: ClaudeCloudComputer) {
    const directory = join(computer.dataRoot, 'servers', computer.serverId, 'claude-cloud');
    const path = join(directory, 'bootstrap-token');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let token: string;
    try {
        token = tokenSchema.parse(await readFile(path, 'utf8'));
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            throw error;
        }
        const created = randomBytes(32).toString('base64url');
        try {
            await writeFile(path, created, { flag: 'wx', mode: 0o600 });
            token = created;
        } catch (cause) {
            if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) {
                throw cause;
            }
            token = tokenSchema.parse(await readFile(path, 'utf8'));
        }
    }
    const response = await fetch(
        new URL('/computer/cloud-agents/bootstrap', computer.serverOrigin),
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ credentialHash: computer.credentialHash, token }),
            signal: AbortSignal.timeout(30_000),
        }
    );
    if (!response.ok) {
        throw new Error('The Server could not register Claude Cloud bootstrap.');
    }
    return {
        serverOrigin: new URL(computer.serverOrigin).origin,
        headerName: 'X-Haus-Cloud-Bootstrap' as const,
        token,
    };
}

/** Keep the dedicated key for a same-key reconnect; revocation never stops existing jobs. */
export async function revokeClaudeCloudBootstrap(computer: ClaudeCloudComputer): Promise<void> {
    const response = await fetch(
        new URL('/computer/cloud-agents/bootstrap-revoke', computer.serverOrigin),
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ credentialHash: computer.credentialHash }),
            signal: AbortSignal.timeout(30_000),
        }
    );
    if (!response.ok) {
        throw new Error('The Server could not revoke Claude Cloud bootstrap.');
    }
}
