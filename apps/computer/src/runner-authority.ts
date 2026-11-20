import { createHash } from 'node:crypto';
import type { RunAgentLaunchOptions } from './launch.ts';

const authorityTimeoutMs = 30_000;

interface ComputerAttachment {
    credential: string;
    serverOrigin: string;
}

export async function mintRunner(options: RunAgentLaunchOptions) {
    return await mintRunCredential(
        { credential: options.attachment.credential, serverOrigin: options.serverOrigin },
        {
            agentId: options.command.agentId,
            chatId: options.command.chatId,
            runId: options.command.runId,
        }
    );
}

export async function revokeRunner(options: RunAgentLaunchOptions, runnerId: string) {
    await revokeRunCredential(
        { credential: options.attachment.credential, serverOrigin: options.serverOrigin },
        runnerId
    );
}

export async function mintRunCredential(
    attachment: ComputerAttachment,
    run: { agentId: string; chatId: string | null; runId: string }
) {
    return await postJson<{ runnerId: string; runnerToken: string }>(
        attachment.serverOrigin,
        '/computer/runner/mint',
        { ...run, credentialHash: hash(attachment.credential) }
    );
}

export async function revokeRunCredential(attachment: ComputerAttachment, runnerId: string) {
    await postJson(attachment.serverOrigin, '/computer/runner/revoke', {
        credentialHash: hash(attachment.credential),
        runnerId,
    });
}

async function postJson<Response>(origin: string, path: string, body: object): Promise<Response> {
    const response = await fetch(new URL(path, origin), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(authorityTimeoutMs),
    });
    const payload = (await response.json()) as Response & { error?: string };
    if (!response.ok) {
        throw new Error(payload.error ?? 'The Computer request was rejected.');
    }
    return payload;
}

function hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
}
