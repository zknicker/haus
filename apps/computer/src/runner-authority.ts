import { createHash } from 'node:crypto';
import type { RunAgentLaunchOptions } from './launch.ts';

export async function mintRunner(options: RunAgentLaunchOptions) {
    return await postJson<{ runnerId: string; runnerToken: string }>(
        options.serverOrigin,
        '/computer/runner/mint',
        {
            agentId: options.command.agentId,
            chatId: options.command.chatId,
            credentialHash: hash(options.attachment.credential),
            runId: options.command.runId,
        }
    );
}

export async function revokeRunner(options: RunAgentLaunchOptions, runnerId: string) {
    await postJson(options.serverOrigin, '/computer/runner/revoke', {
        credentialHash: hash(options.attachment.credential),
        runnerId,
    });
}

async function postJson<Response>(origin: string, path: string, body: object): Promise<Response> {
    const response = await fetch(new URL(path, origin), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
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
