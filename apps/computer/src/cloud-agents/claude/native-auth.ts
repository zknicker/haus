import { loadClaudeCredentials } from '@haus/claude-usage';
import * as z from 'zod';
import { resolveRuntimeExecutable } from '../../runtime-discovery.ts';

const statusSchema = z.object({
    authMethod: z.string().optional(),
    email: z.string().nullable().optional(),
    loggedIn: z.boolean(),
    orgId: z.string().optional(),
});

export type ClaudeNativeAccount =
    | { email: string | null; orgId: string | null; signedIn: true }
    | { signedIn: false };

/**
 * Claude Cloud uses this Computer's own Claude Code sign-in: the same login
 * the Claude Code runtime uses, read through `claude auth status`. Haus never
 * copies the credential into a store of its own.
 */
export async function readClaudeNativeAccount(signal?: AbortSignal): Promise<ClaudeNativeAccount> {
    const executable = resolveRuntimeExecutable('claude');
    if (!executable) {
        throw new ClaudeCodeMissingError();
    }
    const child = Bun.spawn([executable.path, 'auth', 'status', '--json'], {
        env: { ...process.env, PATH: executable.searchPath },
        stderr: 'ignore',
        stdout: 'pipe',
        timeout: 10_000,
        ...(signal ? { signal } : {}),
    });
    const output = await new Response(child.stdout).text();
    if ((await child.exited) !== 0) {
        return { signedIn: false };
    }
    const status = statusSchema.safeParse(JSON.parse(output));
    // Cloud sessions belong to a claude.ai subscription login, never an API key.
    if (!(status.success && status.data.loggedIn && status.data.authMethod === 'claude.ai')) {
        return { signedIn: false };
    }
    return { email: status.data.email ?? null, orgId: status.data.orgId ?? null, signedIn: true };
}

/** Headers for Claude's own session controller, re-read on every request. */
export async function claudeControllerHeaders(
    signal?: AbortSignal
): Promise<Record<string, string>> {
    let loaded = await loadClaudeCredentials();
    if (loaded?.expired) {
        // Any `claude` invocation trades its refresh token for a fresh access token.
        await readClaudeNativeAccount(signal);
        loaded = await loadClaudeCredentials();
    }
    const account = await readClaudeNativeAccount(signal);
    if (!(loaded && !loaded.expired && account.signedIn && account.orgId)) {
        throw new Error('Sign in to Claude Code on this Computer to reach Claude Cloud.');
    }
    return {
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'anthropic-version': '2023-06-01',
        Authorization: `Bearer ${loaded.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'x-organization-uuid': account.orgId,
    };
}

export class ClaudeCodeMissingError extends Error {
    constructor() {
        super('Install Claude Code on this Computer to use Claude Cloud.');
        this.name = 'ClaudeCodeMissingError';
    }
}
