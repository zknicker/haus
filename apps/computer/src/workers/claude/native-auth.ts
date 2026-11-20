import * as z from 'zod';
import { resolveClaudeCredentials } from '../../runtime/claude-code/claude-credentials.ts';

const profileUrl = 'https://api.anthropic.com/api/oauth/profile';
const profileSchema = z.object({
    account: z.object({ email: z.string().nullish() }),
    organization: z.object({ uuid: z.string().min(1) }),
});

export type ClaudeNativeAccount =
    | { email: string | null; orgId: string; signedIn: true; token: string }
    | { signedIn: false };

/**
 * Claude Cloud uses the same Claude subscription login this Computer's Claude
 * Code Agents run with: the one `resolveClaudeCredentials` reads and refreshes.
 * The `claude` CLI's own store can hold a different, stale copy, so Haus hands
 * the CLI this token instead of trusting it. Claude's profile confirms the
 * token still works and names the organization the session controller needs.
 */
export async function readClaudeNativeAccount(
    signal?: AbortSignal,
    env: NodeJS.ProcessEnv = process.env
): Promise<ClaudeNativeAccount> {
    const token = (await claudeCloudCredentials(env)).CLAUDE_CODE_OAUTH_TOKEN;
    // Cloud sessions belong to a claude.ai subscription login, never an API key.
    if (!token) {
        return { signedIn: false };
    }
    const response = await fetch(profileUrl, {
        headers: { 'anthropic-beta': 'oauth-2025-04-20', Authorization: `Bearer ${token}` },
        signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
            : AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403) {
        return { signedIn: false };
    }
    if (!response.ok) {
        throw new Error(`Claude refused the account check (HTTP ${response.status}).`);
    }
    const profile = profileSchema.parse(await response.json());
    return {
        email: profile.account.email ?? null,
        orgId: profile.organization.uuid,
        signedIn: true,
        token,
    };
}

/** The credential env every `claude` cloud command runs with. */
export function claudeCloudCredentials(
    env: NodeJS.ProcessEnv = process.env
): Promise<Record<string, string>> {
    return resolveClaudeCredentials({ env, hostHomeDir: env.HAUS_COMPUTER_HOST_HOME ?? env.HOME });
}

/** Headers for Claude's own session controller, re-read on every request. */
export async function claudeControllerHeaders(
    signal?: AbortSignal
): Promise<Record<string, string>> {
    const account = await readClaudeNativeAccount(signal);
    if (!account.signedIn) {
        throw new Error('Sign in to Claude Code on this Computer to reach Claude Cloud.');
    }
    return {
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'anthropic-version': '2023-06-01',
        Authorization: `Bearer ${account.token}`,
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
