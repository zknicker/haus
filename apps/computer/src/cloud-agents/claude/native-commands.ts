import { stripVTControlCharacters } from 'node:util';
import * as z from 'zod';
import { resolveRuntimeExecutable } from '../../runtime-discovery.ts';
import { CloudAgentDeliveryUnconfirmedError } from '../provider.ts';

const sessionIdSchema = z.string().regex(/^session_[A-Za-z0-9]+$/u);
const sendReceiptSchema = z.object({
    ok: z.literal(true),
    session_id: sessionIdSchema,
    url: z.url(),
});
export interface ClaudeCloudReceipt {
    sessionId: string;
    url: string;
}

/** New hosted sessions use the native interactive launcher, never a private HTTP API. */
export async function launchNativeClaudeCloud(input: {
    cwd: string;
    instructions: string;
    modelId: string | null;
    trustOwnedCheckout?: boolean;
    signal?: AbortSignal;
}): Promise<ClaudeCloudReceipt> {
    const executable = requireClaude();
    let output = '';
    let trusted = false;
    let trustSelection: ReturnType<typeof setTimeout> | undefined;
    let trustConfirmation: ReturnType<typeof setTimeout> | undefined;
    const decoder = new TextDecoder();
    const child = Bun.spawn(
        [
            executable.path,
            ...(input.modelId ? ['--model', input.modelId] : []),
            '--cloud',
            input.instructions,
        ],
        {
            cwd: input.cwd,
            env: { ...process.env, PATH: executable.searchPath },
            terminal: {
                cols: 120,
                rows: 40,
                data(terminal, chunk) {
                    output = (output + decoder.decode(chunk, { stream: true })).slice(-64_000);
                    const text = stripVTControlCharacters(output).replace(/\s+/gu, '');
                    if (
                        input.trustOwnedCheckout &&
                        !trusted &&
                        text.includes('Quicksafetycheck:Isthisa') &&
                        text.includes('projectyoucreatedoroneyoutrust?') &&
                        text.includes('Yes,Itrustthisfolder') &&
                        text.includes('❯No,exit') &&
                        text.includes('Entertoconfirm')
                    ) {
                        trusted = true;
                        trustSelection = setTimeout(() => {
                            if (!terminal.closed) {
                                terminal.write('\u001b[B');
                                trustConfirmation = setTimeout(() => {
                                    if (!terminal.closed) {
                                        terminal.write('\r');
                                    }
                                }, 200);
                            }
                        }, 300);
                    }
                },
            },
            timeout: 120_000,
            ...(input.signal ? { signal: input.signal } : {}),
        }
    );
    try {
        const exitCode = await child.exited;
        const match = output.match(/https:\/\/claude\.ai\/code\/(session_[A-Za-z0-9]+)/u);
        const sessionId = sessionIdSchema.safeParse(match?.[1]);
        if (exitCode !== 0 || !sessionId.success) {
            throw new CloudAgentDeliveryUnconfirmedError(
                'Native Claude launch did not return a hosted session receipt. Inspect Claude before retrying.'
            );
        }
        return { sessionId: sessionId.data, url: `https://claude.ai/code/${sessionId.data}` };
    } finally {
        clearTimeout(trustSelection);
        clearTimeout(trustConfirmation);
        child.terminal?.close();
    }
}

/** Receipt means prompt delivery; only native hooks establish execution and completion. */
export async function sendNativeClaudeCloud(input: {
    sessionId: string;
    instructions: string;
    modelId?: string | null;
    signal?: AbortSignal;
}): Promise<ClaudeCloudReceipt> {
    const executable = requireClaude();
    const sessionId = sessionIdSchema.parse(input.sessionId);
    const child = Bun.spawn(
        [
            executable.path,
            ...(input.modelId ? ['--model', input.modelId] : []),
            '-p',
            '--cloud',
            sessionId,
            '--output-format',
            'json',
            input.instructions,
        ],
        {
            env: { ...process.env, PATH: executable.searchPath },
            stdout: 'pipe',
            stderr: 'ignore',
            timeout: 30_000,
            ...(input.signal ? { signal: input.signal } : {}),
        }
    );
    try {
        const output = await new Response(child.stdout).text();
        if ((await child.exited) !== 0) {
            throw new Error('No native delivery receipt.');
        }
        const receipt = sendReceiptSchema.parse(JSON.parse(output));
        if (receipt.session_id !== sessionId) {
            throw new Error('Native delivery session did not match.');
        }
        return { sessionId, url: receipt.url };
    } catch {
        throw new CloudAgentDeliveryUnconfirmedError(
            'Native Claude delivery could not be confirmed. Wait for its correlated prompt hook before retrying.'
        );
    }
}

function requireClaude() {
    const executable = resolveRuntimeExecutable('claude');
    if (!executable) {
        throw new Error('Install Claude Code on this Computer before connecting Claude Cloud.');
    }
    return executable;
}
