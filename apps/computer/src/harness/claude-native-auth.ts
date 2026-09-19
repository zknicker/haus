import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { ClaudeUsageAuthError, loadClaudeCredentials } from '@haus/claude-usage';

type ClaudeSettings = Pick<
    NonNullable<Parameters<typeof createClaudeCode>[0]>,
    'effort' | 'maxTurns'
>;

/**
 * Resolve the host login at each native start, keeping Agent homes isolated.
 *
 * The credential rides the `auth` option as an isolated authentication
 * environment. That is not a detail: given any other value the adapter goes
 * looking for the host's Claude subscription itself and spends its rotating
 * refresh token behind Computer's back, which then fails every turn with an
 * OAuth 400. A supplied environment is the one shape it will not second-guess.
 */
export function createComputerClaudeCode(
    settings: ClaudeSettings,
    // Construction seam for boundary tests; production uses the real adapter.
    { createAdapter = createClaudeCode, readEnvironment = claudeNativeEnvironment } = {}
) {
    return {
        ...createAdapter(settings),
        doStart: async (options: Parameters<ReturnType<typeof createClaudeCode>['doStart']>[0]) => {
            const env = await readEnvironment();
            const sandbox = options.sandboxSession;
            // The bridge persists turn settings; credentials belong only in its process environment.
            const spawn: typeof sandbox.spawn = (command) =>
                sandbox.spawn({ ...command, env: { ...command.env, ...env } });
            return createAdapter({ ...settings, auth: env }).doStart({
                ...options,
                sandboxSession: {
                    ...sandbox,
                    spawn,
                    ...('restricted' in sandbox
                        ? { restricted: () => ({ ...sandbox.restricted(), spawn }) }
                        : {}),
                },
            });
        },
    };
}

export async function claudeNativeEnvironment(
    options: {
        environment?: NodeJS.ProcessEnv;
        loadCredentials?: typeof loadClaudeCredentials;
    } = {}
): Promise<Record<string, string>> {
    const environment = options.environment ?? process.env;
    if (
        environment.ANTHROPIC_API_KEY ||
        environment.ANTHROPIC_AUTH_TOKEN ||
        environment.CLAUDE_CODE_OAUTH_TOKEN
    ) {
        return {};
    }
    const loaded = await (options.loadCredentials ?? loadClaudeCredentials)({ environment });
    if (!loaded) {
        throw new ClaudeUsageAuthError(
            'Claude Code authentication required. Sign in to Claude Code on this Computer, then retry the Agent.'
        );
    }
    // The access token lives about eight hours and only the `claude` CLI can
    // spend the refresh token for a new one — an Agent home cannot, and leaving
    // the variable out does not help either, because Claude Code reaches no
    // login at all from a home that is not the host's. So name the one command
    // that fixes it rather than sending someone to sign in again.
    if (loaded.expired) {
        throw new ClaudeUsageAuthError(
            'Claude Code authentication expired. Run `claude` once on this Computer to refresh it, then retry the Agent.'
        );
    }
    return { CLAUDE_CODE_OAUTH_TOKEN: loaded.credentials.accessToken };
}
