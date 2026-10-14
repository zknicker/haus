import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { loadClaudeCredentials } from '@haus/claude-usage';
import * as z from 'zod';
import { resolveRuntimeExecutable } from '../../runtime-discovery.ts';

const execute = promisify(execFile);
const accountSchema = z.object({ loggedIn: z.literal(true), orgId: z.uuid() });

/** Re-read the native login; credentials never enter a controller journal or a second store. */
export async function claudeControllerHeaders(
    signal?: AbortSignal
): Promise<Record<string, string>> {
    const executable = resolveRuntimeExecutable('claude');
    if (!executable) {
        throw new Error('Claude Code is unavailable on this Computer.');
    }
    const loaded = await loadClaudeCredentials({
        environment: process.env,
        ...(process.env.CLAUDE_CONFIG_DIR
            ? { credentialsPath: join(process.env.CLAUDE_CONFIG_DIR, '.credentials.json') }
            : {}),
        async readKeychain(service) {
            if (process.platform !== 'darwin') {
                return null;
            }
            try {
                const result = await execute(
                    '/usr/bin/security',
                    ['find-generic-password', '-s', service, '-w'],
                    { timeout: 5000, signal }
                );
                return result.stdout.trim() || null;
            } catch (error) {
                if (
                    error instanceof Error &&
                    'code' in error &&
                    (error.code === 44 || error.code === '44' || error.code === 'ENOENT')
                ) {
                    return null;
                }
                throw new Error('The native Claude credential store could not be read.');
            }
        },
    });
    if (!loaded || loaded.expired) {
        throw new Error('Refresh the native Claude login before stopping cloud work.');
    }
    const child = Bun.spawn([executable.path, 'auth', 'status', '--json'], {
        env: { ...process.env, PATH: executable.searchPath },
        stdout: 'pipe',
        stderr: 'ignore',
        timeout: 5000,
        ...(signal ? { signal } : {}),
    });
    const output = await new Response(child.stdout).text();
    if ((await child.exited) !== 0) {
        throw new Error('The native Claude login is unavailable.');
    }
    const account = accountSchema.parse(JSON.parse(output));
    return {
        Authorization: `Bearer ${loaded.credentials.accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': account.orgId,
    };
}
