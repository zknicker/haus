import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { resolveRuntimeById } from './runtime-discovery.ts';
import { readRuntimeIssues, recordRuntimeAuthentication } from './runtime-issues.ts';

const execFileAsync = promisify(execFile);
const claudeAuthStatusSchema = z.object({ loggedIn: z.boolean() });

/** Reconcile a historical failure with the native runtime's current login. */
export async function refreshRuntimeAuthentication(input: {
    dataRoot: string;
    searchPath?: string;
    now?: Date;
}): Promise<void> {
    const checkedAt = (input.now ?? new Date()).toISOString();
    const issues = await readRuntimeIssues(input.dataRoot);
    if (!issues.some((issue) => issue.runtimeId === 'claude-code')) {
        return;
    }
    const executable = resolveRuntimeById('claude-code', input);
    if (!executable) {
        return;
    }

    let stdout: string;
    try {
        ({ stdout } = await execFileAsync(executable.path, ['auth', 'status'], {
            env: { ...process.env, PATH: executable.searchPath },
            timeout: 10_000,
            maxBuffer: 64 * 1024,
        }));
    } catch {
        // A failed or unsupported check is no evidence of recovery.
        return;
    }
    let document: unknown;
    try {
        document = JSON.parse(stdout);
    } catch {
        return;
    }
    const status = claudeAuthStatusSchema.safeParse(document);
    if (status.success && status.data.loggedIn) {
        await recordRuntimeAuthentication({
            dataRoot: input.dataRoot,
            runtimeId: 'claude-code',
            checkedAt,
            issue: null,
        });
    }
}
