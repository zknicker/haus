import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import * as z from 'zod';
import { resolveRuntimeExecutable } from '../../runtime-discovery.ts';
import { ClaudeCodeMissingError, claudeCloudCredentials } from './native-auth.ts';

const sessionIdSchema = z.string().regex(/^session_[A-Za-z0-9]+$/u);
const sendReceiptSchema = z.object({
    ok: z.literal(true),
    session_id: sessionIdSchema,
    url: z.url(),
});
const terminalTailLines = 20;
const terminalTailCharacters = 4000;

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
    /** Pins the new hosted session to this Anthropic-hosted environment; `null` leaves Claude's own default. */
    environmentId: string | null;
    modelId: string | null;
    prompt: string;
    /** Test seam; real callers never pass this. */
    resolveExecutable?: typeof resolveRuntimeExecutable;
    signal?: AbortSignal;
}): Promise<ClaudeCloudReceipt> {
    const executable = requireClaude(input.resolveExecutable);
    if (input.environmentId) {
        await writeClaudeEnvironmentPin(input.cwd, input.environmentId);
    }
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
            env: await cloudEnv(executable.searchPath),
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
            // The launch owner settles this failed attempt and logs Claude's own words on this Computer.
            throw new Error(
                `Claude Code did not report the hosted session it started (exit ${exitCode}). Terminal output:\n${terminalTail(output)}`
            );
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
            env: await cloudEnv(executable.searchPath),
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

/**
 * The last readable lines the launcher printed. Column moves stand in for
 * spaces in Claude's TUI, so they become spaces before the codes are stripped.
 */
export function terminalTail(output: string): string {
    const lines = stripVTControlCharacters(output.replace(/\u001b\[\d*[CG]/gu, ' '))
        .split(/\r\n|\r|\n/u)
        .map((line) => line.replace(/\s+/gu, ' ').trim())
        .filter((line) => line.length > 0);
    const tail = lines.slice(-terminalTailLines).join('\n');
    return tail.length > 0 ? tail.slice(-terminalTailCharacters) : '(no output)';
}

function asksForFolderTrust(output: string): boolean {
    const text = stripVTControlCharacters(output).replace(/\s+/gu, '');
    return (
        text.includes('Yes,Itrustthisfolder') &&
        text.includes('No,exit') &&
        text.includes('Entertoconfirm')
    );
}

/**
 * Claude Code reads its cloud environment default from `remote.defaultEnvironmentId` in
 * settings, and project-local settings win over the user's own. Writing it into this
 * throwaway checkout scopes the pin to this one launch, so concurrent launches pinned to
 * different environments never race on a shared file.
 */
export async function writeClaudeEnvironmentPin(cwd: string, environmentId: string): Promise<void> {
    const directory = join(cwd, '.claude');
    await mkdir(directory, { recursive: true });
    await writeFile(
        join(directory, 'settings.local.json'),
        `${JSON.stringify({ remote: { defaultEnvironmentId: environmentId } })}\n`
    );
}

function requireClaude(
    resolveExecutable: typeof resolveRuntimeExecutable = resolveRuntimeExecutable
) {
    const executable = resolveExecutable('claude');
    if (!executable) {
        throw new ClaudeCodeMissingError();
    }
    return executable;
}

/**
 * The CLI runs with the login Haus's Claude Code Agents use, passed as a token,
 * so a stale copy in the CLI's own keychain entry is never read.
 */
async function cloudEnv(searchPath: string): Promise<Record<string, string | undefined>> {
    return { ...process.env, ...(await claudeCloudCredentials()), PATH: searchPath };
}
