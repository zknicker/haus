import { stripVTControlCharacters } from 'node:util';
import * as z from 'zod';
import { resolveRuntimeExecutable } from '../../runtime-discovery.ts';
import { ClaudeCodeMissingError } from './native-auth.ts';

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

/**
 * Starts a hosted session with Claude Code's own `--cloud` launcher, run in a
 * terminal because only the interactive launcher creates one. It runs inside a
 * checkout Haus made for this launch, so the folder-trust prompt is accepted.
 */
export async function launchNativeClaudeCloud(input: {
    cwd: string;
    modelId: string | null;
    prompt: string;
    signal?: AbortSignal;
}): Promise<ClaudeCloudReceipt> {
    const executable = requireClaude();
    let output = '';
    let trusted = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const decoder = new TextDecoder();
    const child = Bun.spawn(
        [
            executable.path,
            ...(input.modelId ? ['--model', input.modelId] : []),
            '--cloud',
            input.prompt,
        ],
        {
            cwd: input.cwd,
            env: { ...process.env, PATH: executable.searchPath },
            terminal: {
                cols: 120,
                data(terminal, chunk) {
                    output = (output + decoder.decode(chunk, { stream: true })).slice(-64_000);
                    if (trusted || !asksForFolderTrust(output)) {
                        return;
                    }
                    trusted = true;
                    // Move to "Yes, I trust this folder", then confirm.
                    timers.push(
                        setTimeout(() => terminal.closed || terminal.write('\u001b[B'), 300),
                        setTimeout(() => terminal.closed || terminal.write('\r'), 500)
                    );
                },
                rows: 40,
            },
            killSignal: 'SIGKILL',
            timeout: 120_000,
            ...(input.signal ? { signal: input.signal } : {}),
        }
    );
    try {
        const exitCode = await child.exited;
        const match = output.match(/https:\/\/claude\.ai\/code\/(session_[A-Za-z0-9]+)/u);
        const sessionId = sessionIdSchema.safeParse(match?.[1]);
        if (exitCode !== 0 || !sessionId.success) {
            // The launch owner settles this failed attempt and notifies its delegating Agent.
            throw new Error('Claude Code did not report the hosted session it started.');
        }
        return { sessionId: sessionId.data, url: `https://claude.ai/code/${sessionId.data}` };
    } finally {
        for (const timer of timers) {
            clearTimeout(timer);
        }
        child.terminal?.close();
    }
}

/** Delivers a follow-up prompt to a hosted session; the receipt means delivery, not execution. */
export async function sendNativeClaudeCloud(input: {
    modelId: string | null;
    prompt: string;
    sessionId: string;
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
            input.prompt,
        ],
        {
            env: { ...process.env, PATH: executable.searchPath },
            stderr: 'ignore',
            stdout: 'pipe',
            timeout: 30_000,
            ...(input.signal ? { signal: input.signal } : {}),
        }
    );
    const output = await new Response(child.stdout).text();
    if ((await child.exited) !== 0) {
        throw new Error('Claude Code did not confirm the follow-up delivery.');
    }
    const receipt = sendReceiptSchema.parse(JSON.parse(output));
    if (receipt.session_id !== sessionId) {
        throw new Error('Claude Code delivered the follow-up to a different session.');
    }
    return { sessionId, url: receipt.url };
}

function asksForFolderTrust(output: string): boolean {
    const text = stripVTControlCharacters(output).replace(/\s+/gu, '');
    return (
        text.includes('Yes,Itrustthisfolder') &&
        text.includes('No,exit') &&
        text.includes('Entertoconfirm')
    );
}

function requireClaude() {
    const executable = resolveRuntimeExecutable('claude');
    if (!executable) {
        throw new ClaudeCodeMissingError();
    }
    return executable;
}
